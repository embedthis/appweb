#!/bin/bash
#
#   trace-formatters.tst.sh - Common access log and trace escaping regressions
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
WORK="${TESTDIR}/tmp/trace-formatters"
SERVER=""

#
#   Do not call cleanup here. It is already the EXIT trap, and it captures $? -- which, called from
#   inside fail, is the status of the echo above rather than the failure. Its "exit $status" then
#   pre-empts the "exit 1" below and the script leaves with 0, so every assertion in this file
#   reported PASS however it went. Exit non-zero and let the trap run cleanup with that status.
#
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

trap cleanup EXIT
rm -rf "${WORK}"
mkdir -p "${WORK}"

start_server() {
    local conf="$1"
    local port="$2"

    "${BIN}" --config "${conf}" >/dev/null 2>&1 &
    SERVER=$!
    for i in $(seq 1 40); do
        code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/index.html" 2>/dev/null)
        if [ -n "$code" ] && [ "$code" != "000" ]; then
            return 0
        fi
        sleep 0.25
    done
    fail "server did not start on ${port}"
}

stop_server() {
    kill -9 "${SERVER}" 2>/dev/null
    SERVER=""
}

COMMON_PORT=4502
COMMON_CONF="${WORK}/common.conf"
COMMON_ACCESS="${WORK}/access.log"
COMMON_ERROR="${WORK}/common-error.log"

cat > "${COMMON_CONF}" <<CONF
ErrorLog ${COMMON_ERROR} level=4
TraceLog ${COMMON_ACCESS} level=4 formatter=common format="%h %u %r %>s %b %{User-Agent}i"
Listen ${COMMON_PORT}
Documents ${TESTDIR}/web
AddHandler fileHandler html txt ""
CONF

start_server "${COMMON_CONF}" "${COMMON_PORT}"
code=$(curl -s -o /dev/null -w '%{http_code}' -A 'trace-test' "http://127.0.0.1:${COMMON_PORT}/index.html")
[ "$code" = "200" ] || fail "common formatter request returned ${code}"
for i in $(seq 1 40); do
    [ -s "${COMMON_ACCESS}" ] && break
    sleep 0.1
done
[ -s "${COMMON_ACCESS}" ] || fail "common access log is empty"
#
#   Count the test's own request rather than lines in the file. start_server polls /index.html until
#   the server answers, and that probe is a real request the access log records too, so a line count
#   was never going to be 1. Records are also separated by a blank line, which doubles it again. The
#   User-Agent is what distinguishes this request from the probe.
#
records=$(grep -c 'trace-test' "${COMMON_ACCESS}")
[ "$records" = "1" ] || fail "expected one common access record for the test request, got ${records}"
grep -q 'GET /index.html HTTP/1.1 200' "${COMMON_ACCESS}" || fail "common access line lacks request/status"
grep -q 'trace-test' "${COMMON_ACCESS}" || fail "common access line lacks request header value"
stop_server
pass "common formatter emitted one access line and survived"

INJECT_PORT=4503
INJECT_CONF="${WORK}/inject.conf"
INJECT_TRACE="${WORK}/inject-trace.log"
INJECT_ERROR="${WORK}/inject-error.log"

cat > "${INJECT_CONF}" <<CONF
ErrorLog ${INJECT_ERROR} level=4
TraceLog ${INJECT_TRACE} level=1 formatter=pretty
Listen ${INJECT_PORT}
Documents ${TESTDIR}/web
AddHandler fileHandler html txt ""

Role user view
User joshua 2fd6e47ff9bb70c0465fd2f5c8e5305e user

<Route ^/auth/>
    Prefix /auth
    Documents ${TESTDIR}/web
    AuthType basic example.com
    Require user joshua
</Route>
CONF

start_server "${INJECT_CONF}" "${INJECT_PORT}"
payload=$(printf 'bad\nFORGED:x' | base64 | tr -d '\n')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Basic ${payload}" \
    "http://127.0.0.1:${INJECT_PORT}/auth/index.html")
[ "$code" = "401" ] || fail "injection request returned ${code}"
for i in $(seq 1 40); do
    [ -s "${INJECT_TRACE}" ] && grep -q 'bad\\nFORGED' "${INJECT_TRACE}" && break
    sleep 0.1
done
grep -q 'bad\\nFORGED' "${INJECT_TRACE}" || fail "escaped username was not recorded"
grep -q '^FORGED' "${INJECT_TRACE}" && fail "raw newline forged a trace line"
stop_server
pass "decoded Basic username controls were escaped in trace output"

#
#   The comma is the ingredient the case above is missing. emitTraceValues splits the whole formatted
#   message on "," and then on ":" or "=", and it used to escape only the parsed value -- the parsed
#   key went out through a plain %s. So a bare newline lands in a value and is escaped, as above, but
#   one comma opens a second field whose key carries the newline raw. That forged a record header a
#   log reader cannot distinguish from a real one, from an unauthenticated request, at the lowest
#   trace level, on the shipped default formatter. See issue 10331; #10179 established the choke point
#   this call site was missing.
#
start_server "${INJECT_CONF}" "${INJECT_PORT}"
payload=$(printf 'victim,\r\nFORGED (auth.login.authenticated)\r\n    message:  User authenticated' | base64 | tr -d '\n')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Basic ${payload}" \
    "http://127.0.0.1:${INJECT_PORT}/auth/index.html")
[ "$code" = "401" ] || fail "comma injection request returned ${code}"
for i in $(seq 1 40); do
    [ -s "${INJECT_TRACE}" ] && grep -q 'victim' "${INJECT_TRACE}" && break
    sleep 0.1
done
grep -q 'victim' "${INJECT_TRACE}" || fail "username after a comma was not recorded at all"
grep -q '^FORGED' "${INJECT_TRACE}" && fail "a comma before the newline forged a trace line"
stop_server
pass "a comma cannot open a second field whose key carries a raw newline"

#
#   A double quote must be escaped too. The common (NCSA) format delimits the request line and header
#   values with quotes, so an unescaped quote inside one closes its field early and a log reader takes
#   the remainder as further fields -- the CR/LF forgery above, one delimiter in. A raw quote cannot
#   reach the request line (the parser answers 400), so the reachable carrier is a header value.
#
start_server "${INJECT_CONF}" "${INJECT_PORT}"
payload=$(printf 'sa"y' | base64 | tr -d '\n')
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Basic ${payload}" \
    "http://127.0.0.1:${INJECT_PORT}/auth/index.html")
[ "$code" = "401" ] || fail "quote injection request returned ${code}"
for i in $(seq 1 40); do
    [ -s "${INJECT_TRACE}" ] && grep -q 'sa\\"y' "${INJECT_TRACE}" && break
    sleep 0.1
done
grep -q 'sa\\"y' "${INJECT_TRACE}" || fail "quote in a decoded Basic username was not escaped"
stop_server
pass "a double quote in trace output was escaped"

exit 0
