#!/bin/bash
#
#   config-nested-if.tst.sh - A nested <if> inside a false <if> must not discard the rest of the file
#
#   The directive dispatch loop skipped every directive inside a disabled block except </if>. A
#   nested <if> was therefore skipped and never pushed a parser state, while its </if> was still
#   processed and popped one -- so the outer </if> popped the enclosing block instead. Parsing then
#   continued against the wrong state and every directive after the block was silently dropped. No
#   error was logged and the server started normally.
#
#   The consequence is an authorization bypass, not merely a missing route: the authenticated routes
#   in the stock test configuration are defined after such a block, so on a build where the outer
#   condition is false they were never registered and their documents were served to anonymous
#   clients with 200. That is what this asserts -- the 401 is the point, the marker only localises a
#   failure to the parser.
#
#   The outer condition is an unknown key, which conditionalDefinition() evaluates false on every
#   platform, so this reproduces everywhere rather than only where a module happens to be absent.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${TESTDIR}/utils/testenv.sh"

BIN="$(tmAppweb "${TESTDIR}/../build/bin")"
PORT=4508
WORK="${TESTDIR}/tmp/config-nested-if"

#   Paths that go into the configuration appweb reads, rather than into a shell command
NATIVE="$(tmNative "${TESTDIR}")"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}"

CONF="${WORK}/nested-if.conf"
LOG="${WORK}/appweb.log"
NATIVE_WORK="${NATIVE}/tmp/config-nested-if"

#
#   mary's password is "pass2" in realm example.com, the same credential test/appweb.conf uses.
#
cat > "${CONF}" <<CONF
ErrorLog ${NATIVE_WORK}/appweb.log level=4
Listen ${PORT}
Documents ${NATIVE}/web
AddHandler fileHandler html txt ""

User mary 5b90553bea8ba3686f4239d62801f0f3 user executive

<if NEVER_DEFINED_CONDITION>
    <if PCRE2>
        Header set X-Marker inner
    </if>
</if>

<Route ^/nested-if/marker>
    Header set X-Marker after
    Target write 200 "after"
</Route>

<Route ^/nested-if/protected>
    AuthType basic example.com
    Require user mary
    Target write 200 "secret"
</Route>
CONF

"${BIN}" --config "${CONF}" >/dev/null 2>&1 &
PID=$!

trap 'tmStopServer ${PID}; rm -rf "${WORK}"' EXIT

for i in $(seq 1 50); do
    curl -s -o /dev/null "http://localhost:${PORT}/nested-if/marker" && break
    sleep 0.2
done

kill -0 ${PID} 2>/dev/null || fail "appweb did not start; see ${LOG}"

#
#   The route after the block must exist at all.
#
MARKER=$(curl -s -D - -o /dev/null "http://localhost:${PORT}/nested-if/marker" | tr -d '\r' | grep -i '^X-Marker:')
[ "${MARKER}" = "X-Marker: after" ] || \
    fail "the route after the nested <if> block was discarded (X-Marker was \"${MARKER}\")"

#
#   And it must still be authorized. This is the assertion the defect broke.
#
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/nested-if/protected")
[ "${CODE}" = "401" ] || fail "an anonymous request to the protected route returned ${CODE}, not 401"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -u mary:pass2 "http://localhost:${PORT}/nested-if/protected")
[ "${CODE}" = "200" ] || fail "an authenticated request to the protected route returned ${CODE}, not 200"

echo "PASS: a nested <if> in a disabled block leaves the rest of the configuration intact"
exit 0
