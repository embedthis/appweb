#!/bin/bash
#
#   fork-failure-reap.tst.sh - A failed FastCGI or proxy launch fork leaves no child reaper and no listener behind
#
#   startFastApp() and startProxyApp() install a per-app SIGCHLD handler before fork(). If fork() fails, the app
#   must be left with pid 0 and no handler: a handler left with pid -1 calls waitpid(-1, WNOHANG) on every SIGCHLD
#   and reaps whichever child exited, so a CGI command loses its exit status and the MPR command layer spins on
#   ECHILD ("Waitpid failed"). A failed FastCGI launch must also close the listening socket made for it.
#
#   The fork failure is injected with a test-only interposer (forkfail-interpose.c, built here) that fails the
#   first four forks the server makes: three FastCGI launches, then one proxy launch.
#
#   Oracle: after the failed launches the server holds only its own listening socket, later CGI requests
#   succeed, and the error log carries no waitpid failure. The waitpid theft is a race, so it shows only on some
#   runs; the leaked listener is deterministic.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
BINDIR="${TESTDIR}/../build/bin"
BIN="${BINDIR}/appweb"
PORT=4511
PROXYPORT=4512
WORK="${TESTDIR}/tmp/fork-failure-reap"
CONF="${WORK}/appweb.conf"
LOG="${WORK}/error.log"

fail() { echo "FAIL: $*"; exit 1; }

for prog in appweb cgiProgram fastProgram; do
    if [ ! -x "${BINDIR}/${prog}" ]; then
        echo "SKIP: ${prog} is not built in ${BINDIR}"
        exit 0
    fi
done
if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: the FastCGI and proxy launch paths are ME_UNIX_LIKE only"
    exit 0
fi
if ! command -v cc >/dev/null; then
    echo "SKIP: no C compiler to build the fork interposer"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}/web" "${WORK}/cgi-bin" "${WORK}/fast-bin"
echo ok > "${WORK}/web/index.html"
echo x > "${WORK}/fast-bin/x.fast"
cp "${BINDIR}/cgiProgram" "${WORK}/cgi-bin/cgiProgram"

if [ "$(uname -s)" = "Darwin" ]; then
    cc -dynamiclib -o "${WORK}/forkfail.dylib" "${HERE}/forkfail-interpose.c" || fail "cannot build the interposer"
    PRELOAD="DYLD_INSERT_LIBRARIES=${DYLD_INSERT_LIBRARIES:+${DYLD_INSERT_LIBRARIES}:}${WORK}/forkfail.dylib"
else
    cc -shared -fPIC -o "${WORK}/forkfail.so" "${HERE}/forkfail-interpose.c" -ldl || fail "cannot build the interposer"
    #   Append: the sanitizer run preloads the ASan runtime, which must stay first
    PRELOAD="LD_PRELOAD=${LD_PRELOAD:+${LD_PRELOAD}:}${WORK}/forkfail.so"
fi

server=""
#   The server is started in a session of its own: Appweb ends with kill(0, SIGQUIT), which must not reach the
#   test runner (see fast-launch-fork.tst.sh).
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

cat > "${CONF}" <<CONF
ErrorLog ${LOG} level=2
Listen 127.0.0.1:${PORT}
Documents ${WORK}/web
AddHandler fileHandler
ScriptAlias /cgi-bin/ "${WORK}/cgi-bin/"
<Route ^/fast/(.*)\$>
    AddHandler fastHandler
    Prefix /fast
    Documents ${WORK}/fast-bin
    FastConnect 127.0.0.1:0 launch="${BINDIR}/fastProgram" keep min=0 max=1 multiplex=1 wait=5secs
    Target run \$1
</Route>
<Route ^/proxy/(.*)\$>
    Reset pipeline
    SetHandler proxyHandler
    ProxyConnect 127.0.0.1:${PROXYPORT} launch="${BIN} --config ${WORK}/backend.conf" min=0 max=1 timeout=5secs
</Route>
CONF

#   The interposer variable is set by env(1) after perl, so it is not stripped from a protected binary on macOS
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' env "${PRELOAD}" FORKFAIL_AT=1,2,3,4 \
    "${BIN}" --config "${CONF}" >/dev/null 2>&1 &
server=$!

for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null && break
    sleep 0.25
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server did not start"

for i in 1 2 3; do
    code=$(curl -s -m 10 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/fast/x.fast")
    [ "${code}" = "500" ] || fail "expected the injected FastCGI fork failure to answer 500, got ${code}"
done
code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/proxy/index.html")
case "${code}" in
5??) ;;
*) fail "expected the injected proxy fork failure to answer 5xx, got ${code}" ;;
esac

if command -v lsof >/dev/null; then
    listeners=$(lsof -a -p "${server}" -iTCP -sTCP:LISTEN 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')
    [ "${listeners}" -le 1 ] || fail "failed FastCGI launches leaked listening sockets: server holds ${listeners}"
fi

for i in $(seq 1 10); do
    code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/cgi-bin/cgiProgram")
    [ "${code}" = "200" ] || fail "CGI request ${i} after the failed launches answered ${code}"
done

#   The next FastCGI launch is not injected and succeeds
code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/fast/x.fast")
[ "${code}" = "200" ] || fail "the FastCGI launch after the injected failures answered ${code}"
sleep 0.5

if grep -q "Waitpid failed" "${LOG}"; then
    fail "a CGI child was reaped by a failed launch's SIGCHLD handler ($(grep -c 'Waitpid failed' "${LOG}") failures)"
fi
kill -0 "${server}" 2>/dev/null || fail "the server died"

echo "PASS: failed FastCGI and proxy forks leave no stray child reaper or listener"
exit 0
