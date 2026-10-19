#!/bin/bash
#   Failed FastCGI and proxy opens must release their app reservations. With max=1, a subsequent request must
#   relaunch successfully; exited apps must never be reused.

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BINDIR="${TESTDIR}/../build/bin"
BIN="${BINDIR}/appweb"
FASTPROG="${BINDIR}/fastProgram"
PORT=4613
BACKPORT=4614
WORK="${TESTDIR}/tmp/backend-open-release"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ] || [ ! -x "${FASTPROG}" ]; then
    echo "SKIP: appweb and fastProgram are not built in ${BINDIR}"
    exit 0
fi
if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: FastCGI and proxy launch are ME_UNIX_LIKE only"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}/web" "${WORK}/fast-bin" "${WORK}/bweb"
echo front > "${WORK}/web/index.html"
echo backend > "${WORK}/bweb/index.html"
echo x > "${WORK}/fast-bin/x.fast"

server=""
#   The server runs in a session of its own (see fast-launch-fork.tst.sh), so its kill(0, SIGQUIT) cannot reach
#   the harness. Launched backends are killed by name of this test's directory.
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        kill -TERM "${server}" 2>/dev/null
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "${server}" 2>/dev/null || break
            sleep 0.5
        done
    fi
    for pid in $(pgrep -f "${WORK}/" 2>/dev/null); do
        kill -KILL "${pid}" 2>/dev/null
    done
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

cat > "${WORK}/fast.sh" <<SH
#!/bin/sh
exec "${FASTPROG}"
SH
chmod 644 "${WORK}/fast.sh"

#   FastCGI launcher for the app that exits. A wrapper, as fastProgram would take the target as its endpoint.
cat > "${WORK}/fastexit.sh" <<SH
#!/bin/sh
exec "${FASTPROG}"
SH
chmod 755 "${WORK}/fastexit.sh"

cat > "${WORK}/proxy.sh" <<SH
#!/bin/sh
if [ ! -f "${WORK}/proxy-started" ]; then touch "${WORK}/proxy-started"; exit 1; fi
exec "${BIN}" --config "${WORK}/backend.conf"
SH
chmod 755 "${WORK}/proxy.sh"

cat > "${WORK}/backend.conf" <<CONF
ErrorLog ${WORK}/backend.log level=1
Listen 127.0.0.1:${BACKPORT}
Documents ${WORK}/bweb
AddHandler fileHandler
CONF

cat > "${WORK}/appweb.conf" <<CONF
ErrorLog ${WORK}/error.log level=2
Listen 127.0.0.1:${PORT}
Documents ${WORK}/web
AddHandler fileHandler

<Route ^/fast/(.*)\$>
    AddHandler fastHandler
    Prefix /fast
    Documents ${WORK}/fast-bin
    FastConnect 127.0.0.1:0 launch="${WORK}/fast.sh" keep min=0 max=1 multiplex=1 wait=5secs
    Target run \$1
</Route>

<Route ^/fastexit/(.*)\$>
    AddHandler fastHandler
    Prefix /fastexit
    Documents ${WORK}/fast-bin
    FastConnect 127.0.0.1:0 launch="${WORK}/fastexit.sh" keep min=0 max=1 multiplex=1 wait=10secs
    Target run \$1
</Route>

<Route ^/proxy/(.*)\$>
    Reset pipeline
    SetHandler proxyHandler
    Prefix /proxy
    ProxyConnect 127.0.0.1:${BACKPORT} launch="${WORK}/proxy.sh" min=0 max=1 multiplex=1 timeout=1min
</Route>
CONF

perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --config "${WORK}/appweb.conf" >/dev/null 2>&1 &
server=$!
for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null && break
    sleep 0.25
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server did not start"

status() { curl -s -m 40 -o /dev/null -w "%{http_code}" "$1"; }

code=$(status "http://127.0.0.1:${PORT}/fast/x.fast")
[ "${code}" = "502" ] || fail "FastCGI: expected 502 while the program is not executable, got ${code}"
chmod 755 "${WORK}/fast.sh"
code=$(status "http://127.0.0.1:${PORT}/fast/x.fast")
[ "${code}" = "200" ] || fail "FastCGI: route did not recover after the program became executable, got ${code}"

base="http://127.0.0.1:${PORT}/fastexit/x.fast"
codes=$(curl -s -m 60 -o /dev/null -o /dev/null -o /dev/null -o /dev/null -w "%{http_code} " \
    "${base}?SWITCHES=-x" "${base}?n=1" "${base}?n=2" "${base}?n=3")
[ "${codes}" = "200 200 200 200 " ] || fail "FastCGI: requests after the app exited answered ${codes}"
code=$(status "${base}?n=4")
[ "${code}" = "200" ] || fail "FastCGI: a fresh connection after the app exited answered ${code}"

code=$(status "http://127.0.0.1:${PORT}/proxy/index.html")
[ "${code}" = "503" ] || fail "Proxy: expected 503 while the backend cannot start, got ${code}"
start=$(date +%s)
code=$(status "http://127.0.0.1:${PORT}/proxy/index.html")
elapsed=$(( $(date +%s) - start ))
[ "${code}" = "200" ] || fail "Proxy: route did not relaunch its backend after a failed open, got ${code}"
[ "${elapsed}" -lt 8 ] || fail "Proxy: the relaunch took ${elapsed}s"

echo "PASS: failed backend opens release their app reservation and dead apps are not reused"
exit 0
