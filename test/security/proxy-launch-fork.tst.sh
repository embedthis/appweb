#!/bin/bash
#   A failed proxy exec must leave no child server and return promptly with 5xx. A valid launch must still serve
#   requests.

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4610
PROXYPORT=4611
BACKPORT=4612
WORK="${TESTDIR}/tmp/proxy-launch-fork"
CONF="${WORK}/proxy.conf"
BACKCONF="${WORK}/backend.conf"
LOG="${WORK}/proxy.log"
MISSING="${WORK}/no-such-proxy-app"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi
if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: the proxy launch path is ME_UNIX_LIKE only"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}/web" "${WORK}/back"
echo ok > "${WORK}/web/index.html"
echo backend > "${WORK}/back/index.html"

server=""
#   Isolate the server session so kill(0, SIGQUIT) cannot reach the harness. Kill remaining processes using this
#   test configuration.
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        kill -TERM "${server}" 2>/dev/null
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "${server}" 2>/dev/null || break
            sleep 0.5
        done
    fi
    for pid in $(pgrep -f "appweb.*${WORK}/" 2>/dev/null); do
        kill -KILL "${pid}" 2>/dev/null
    done
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

count_servers() {
    pgrep -f "appweb.*${CONF}" 2>/dev/null | wc -l | tr -d ' '
}

cat > "${BACKCONF}" <<CONF
Listen 127.0.0.1:${BACKPORT}
Documents ${WORK}/back
AddHandler fileHandler html txt ""
CONF

cat > "${CONF}" <<CONF
ErrorLog ${LOG} level=2
Listen 127.0.0.1:${PORT}
Documents ${WORK}/web
AddHandler fileHandler html txt ""

<Route ^/proxymissing/>
    SetHandler proxyHandler
    ProxyConnect 127.0.0.1:${PROXYPORT} launch="${MISSING}" min=0 max=2 timeout=5secs
</Route>

<Route ^/proxyok/>
    SetHandler proxyHandler
    Prefix /proxyok
    ProxyConnect 127.0.0.1:${BACKPORT} launch="${BIN} --config ${BACKCONF}" min=0 max=1 timeout=5secs
</Route>
CONF

[ -e "${MISSING}" ] && fail "the launch program must not exist"

perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --config "${CONF}" >/dev/null 2>&1 &
server=$!

for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null && break
    sleep 0.25
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server did not start"

before=$(count_servers)
[ "${before}" -eq 1 ] || fail "expected exactly the test server, found ${before}"

slowest=0
statuses=""
for _ in 1 2 3; do
    start=$(date +%s)
    status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}/proxymissing/x" 2>/dev/null)
    elapsed=$(( $(date +%s) - start ))
    [ "${elapsed}" -gt "${slowest}" ] && slowest=${elapsed}
    statuses="${statuses} ${status}"
done

sleep 1
after=$(count_servers)
[ "${after}" -eq "${before}" ] || fail "process count went from ${before} to ${after}: a launch child returned into the server"

for status in ${statuses}; do
    case "${status}" in
        5??) ;;
        *) fail "a missing proxy launch program answered ${status}, expected a 5xx" ;;
    esac
done
[ "${slowest}" -lt 10 ] || fail "the error took ${slowest}s: the route is waiting on a launch child that never exec'd"

grep -q "Cannot execute proxy program" "${LOG}" || fail "the error log does not name the missing launch program"

kill -0 "${server}" 2>/dev/null || fail "the server died"
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server stopped serving"

body=$(curl -s --max-time 20 "http://127.0.0.1:${PORT}/proxyok/index.html" 2>/dev/null)
[ "${body}" = "backend" ] || fail "a valid proxy launch program did not serve the request, got \"${body}\""

echo "PASS: a failed proxy launch left ${after} server process and a valid launch still serves"
exit 0
