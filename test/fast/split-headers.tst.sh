#!/bin/bash
#
#   split-headers.tst.sh - A FastCGI app that splits its header block must not kill the server
#
#   parseFastHeaders read its owning FastRequest from packet->data, a field only the outgoing params
#   packet ever carries. Packets arriving from the app are made by httpCreateDataPacket, which never
#   sets it, so req was NULL. Every statement in the function tolerated that except one: the
#   "incomplete headers" diagnostic, reached when a FAST_STDOUT record holds no end of headers
#   delimiter, which logs req->id.
#
#   That log call is why this test needs its own server. httpLog is a macro that evaluates its
#   arguments only when the event level admits the message, and "detail" is level 6 while the shared
#   test configuration runs at 3 -- so the dereference never happens there and the shared suite cannot
#   see this defect at all. An operator turning tracing up to diagnose a misbehaving backend is
#   exactly who hits it, which is the configuration reproduced here.
#
#   Appweb is a single multi threaded process, so the fault took the whole server down and every
#   concurrent connection with it. The assertion is therefore liveness: the server still answers after
#   the split response. No attacker is needed -- an app that flushes its headers before the blank
#   line, or a segment boundary landing mid block, is enough.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
FASTPROG="${TESTDIR}/fast-bin/fastProgram"
WORK="${TESTDIR}/tmp/split-headers"
PORT=4505
CONF="${WORK}/split.conf"
SERVER=""

fail() { echo "FAIL: $*"; exit 1; }
pass() { echo "PASS: $*"; }

cleanup() {
    local status=$?
    if [ -n "${SERVER}" ]; then
        kill -9 "${SERVER}" 2>/dev/null
        SERVER=""
    fi
    rm -rf "${WORK}"
    exit $status
}

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi
if [ ! -x "${FASTPROG}" ]; then
    echo "SKIP: fastProgram fixture is not installed at ${FASTPROG}"
    exit 0
fi

trap cleanup EXIT
rm -rf "${WORK}"
mkdir -p "${WORK}"

#
#   level=6 admits the "detail" events. That is the whole point -- see the header comment.
#
cat > "${CONF}" <<EOF
ErrorLog ${WORK}/error.log level=0
TraceLog ${WORK}/trace.log level=6 formatter=pretty
Listen 127.0.0.1:${PORT}
Documents ${TESTDIR}/web
ExitTimeout 5secs

<Route ^/fast-bin/(.*)\$>
    AddHandler fastHandler
    Prefix /fast-bin
    Documents ${TESTDIR}/fast-bin
    FastConnect 127.0.0.1:0 launch keep min=1 max=1 maxRequests=unlimited timeout=5mins multiplex=1
    Target run \$1
</Route>
EOF

"${BIN}" --config "${CONF}" >/dev/null 2>&1 &
SERVER=$!

for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/index.html" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
        break
    fi
    sleep 0.25
done
[ "${code:-000}" != "000" ] || fail "server did not start on ${PORT}"

request() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
        "http://127.0.0.1:${PORT}/fast-bin/fastProgram?SWITCHES=$1" 2>/dev/null
}

#   Baseline: the app answers when it writes its header block in one piece
code=$(request '-h+1')
[ "$code" = "200" ] || fail "baseline request returned ${code}, expected 200"
pass "an unsplit header block is served normally"

#
#   The trigger. -f flushes after Content-Type, so the first FAST_STDOUT record carries a header block
#   with no terminator. What this response looks like is deliberately not asserted: the first record's
#   bytes are dropped rather than retained and joined, so the surviving header set depends on a
#   separate framing defect that is still open. This test pins the crash, not the framing.
#
request '-f' >/dev/null
kill -0 "${SERVER}" 2>/dev/null || fail "server died on a split FastCGI header block"
pass "the server survived a split header block"

#   The point of the whole test: it is still serving other clients
code=$(request '-h+1')
[ "$code" = "200" ] || fail "server stopped serving after a split header block (returned ${code})"
pass "the server still answers after a split header block"

#   And it survives the trigger arriving repeatedly, not just once
for i in 1 2 3; do
    request '-f' >/dev/null
done
code=$(request '-h+1')
[ "$code" = "200" ] || fail "server stopped serving after repeated split header blocks (returned ${code})"
pass "the server survives repeated split header blocks"

exit 0
