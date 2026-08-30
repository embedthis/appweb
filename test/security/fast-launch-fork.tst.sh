#!/bin/bash
#
#   fast-launch-fork.tst.sh - A FastCGI launch whose execve fails must not fork a copy of the server
#
#   The hand-rolled fork/exec in startFastApp() had no _exit() at all. When execve failed the child
#   returned NULL into getFastApp(), into the request path and on into the MPR event loop, as a
#   second copy of the server. Each request that finds no free FastCGI app calls startFastApp again,
#   so N requests produced N clones and each clone could fork more -- a remote fork bomb reachable
#   with nothing but repeated GETs against a route whose backend binary is missing (10154).
#
#   The trigger is a misconfiguration operators reach by accident: a launch path that is wrong,
#   renamed by a package upgrade, or has lost its +x bit. Here it simply does not exist.
#
#   The request fails either way, so the process count is the assertion that matters. It is taken
#   against this test's own private config path, so a stray appweb from another test cannot be
#   mistaken for a clone and a clone cannot hide behind one.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4502
FASTPORT=4503
WORK="${TESTDIR}/tmp/fast-launch-fork"
CONF="${WORK}/fast.conf"
LOG="${WORK}/fast.log"
MISSING="${WORK}/no-such-fast-app"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi
if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: the FastCGI launch path is ME_UNIX_LIKE only"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}"

server=""
#   Appweb ends with kill(0, SIGQUIT) -- every process in ITS process group, which is this script's
#   group and the test runner's too, not just its children. The server below is therefore started in
#   a session of its own so that signal cannot reach the harness; test/setup.sh instead traps SIGQUIT,
#   which is the same workaround from the other side. Ignoring the signals during teardown as well
#   costs nothing and covers the case where the isolation is unavailable.
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        kill -TERM "${server}" 2>/dev/null
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "${server}" 2>/dev/null || break
            sleep 0.5
        done
        kill -KILL "${server}" 2>/dev/null
    fi
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

#   Count only servers running THIS config, so unrelated appweb processes cannot mask a clone
count_servers() {
    pgrep -f "appweb.*${CONF}" 2>/dev/null | wc -l | tr -d ' '
}

#   Modelled on the working /fast-bin/ route in test/appweb.conf, with the launch program pointed at
#   a path that does not exist. min=0 so the app launches on demand, per request, which is the shape
#   that turns one bad deployment into one clone per request.
cat > "${CONF}" <<CONF
ErrorLog ${LOG} level=2
Listen ${PORT}
Documents ${TESTDIR}/web
AddHandler fileHandler html txt ""

<Route ^/fastmissing/(.*)\$>
    AddHandler fastHandler
    Prefix /fastmissing
    Documents ${TESTDIR}/fast-bin
    FastConnect 127.0.0.1:${FASTPORT} launch="${MISSING}" keep min=0 max=1 timeout=5secs multiplex=1
    Target run \$1
</Route>
CONF

[ -e "${MISSING}" ] && fail "the launch program must not exist"

#   setsid() before exec, so the server's process group holds only the server and its children.
#   perl is present on every platform this test runs on; Linux's setsid(1) is not on macOS.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --config "${CONF}" >/dev/null 2>&1 &
server=$!

for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null; then
        break
    fi
    sleep 0.25
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server did not start"

before=$(count_servers)
[ "${before}" -ge 1 ] || fail "expected the test server to be running, found ${before}"

#   Several requests: one clone per failed launch is the defect, so repetition is the amplifier
#
#   The request must fail as a broken gateway and say so. A missing backend binary is a 502, which is
#   what CGI has always returned for the same condition. It used to be answered with a connection reset
#   after the full request timeout -- curl reported 000 -- which a client cannot tell apart from a
#   network fault or a crashed server (10296). The status is asserted exactly, so a regression back to
#   the reset fails here rather than being read as "the request failed, as expected".
for _ in 1 2 3 4 5; do
    status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}/fastmissing/app" 2>/dev/null)
    [ "${status}" = "502" ] || fail "a missing FastCGI launch program answered ${status}, expected 502"
done

#   The 502 must be prompt, not the request timeout expiring. The reset arrived after 30s; a served
#   error arrives in milliseconds. Ten seconds is far above the latter and well below the former.
start=$(date +%s)
curl -s -o /dev/null --max-time 20 "http://127.0.0.1:${PORT}/fastmissing/app" 2>/dev/null
elapsed=$(( $(date +%s) - start ))
[ "${elapsed}" -lt 10 ] || fail "the 502 took ${elapsed}s: the error is waiting on a timeout, not being served"

#   The operator has to be able to name the cause from the log alone -- that is the difference between
#   "the site is broken" and "the FastCGI binary moved in the last deploy"
grep -q "Cannot execute FastCGI program" "${LOG}" || fail "the error log does not name the missing launch program"

#   A clone re-enters the event loop and persists, so it is present once the requests are done
sleep 1
after=$(count_servers)
[ "${after}" -eq "${before}" ] || fail "process count went from ${before} to ${after}: a launch child escaped into the event loop"

#   The server must still be the one we started, and still serving
kill -0 "${server}" 2>/dev/null || fail "the server died"
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server stopped serving after the failed launches"

echo "PASS: a failed FastCGI launch left ${after} server process(es) and did not fork a clone"
exit 0
