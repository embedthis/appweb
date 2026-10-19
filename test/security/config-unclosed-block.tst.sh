#!/bin/bash
#
#   config-unclosed-block.tst.sh - A block left open at end of a config file must stop the server starting
#
#   A <Route> that is never closed is never finalized and so never added to its host. Its authentication,
#   limits and handlers are dropped and its URIs fall through to the enclosing route, so starting would serve
#   a protected area without credentials. The parser must refuse the file, in the main config and in a file
#   pulled in by Include. The control run with the block closed must answer 401.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${TESTDIR}/utils/testenv.sh"

BIN="$(tmAppweb "${TESTDIR}/../build/bin")"
PORT=4509
WORK="${TESTDIR}/tmp/config-unclosed-block"
NATIVE="$(tmNative "${TESTDIR}")"
NATIVE_WORK="${NATIVE}/tmp/config-unclosed-block"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}/web/admin"
echo public > "${WORK}/web/index.html"
echo protected > "${WORK}/web/admin/secret.txt"

PID=""
trap '[ -n "${PID}" ] && tmStopServer ${PID}; rm -rf "${WORK}"' EXIT

#
#   mary's password is "pass2" in realm example.com, the same credential test/appweb.conf uses.
#
header() {
    cat <<CONF
ErrorLog ${NATIVE_WORK}/$1.log level=2
Listen 127.0.0.1:${PORT}
Documents ${NATIVE_WORK}/web
AddHandler fileHandler
CONF
}
route() {
    cat <<CONF
<Route ^/admin/>
    AuthType basic example.com
    User mary 5b90553bea8ba3686f4239d62801f0f3 user
    Require valid-user
CONF
}

{ header closed; route; echo "</Route>"; } > "${WORK}/closed.conf"
{ header unclosed; route; } > "${WORK}/unclosed.conf"
route > "${WORK}/admin.conf"
{ header include; echo "Include ${NATIVE_WORK}/admin.conf"; echo "Header set X-After include"; } > "${WORK}/include.conf"

#   Status of the public page, or 000 while the server is not accepting
probe() {
    curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/index.html" 2>/dev/null
}

#
#   Expect the server to exit with an error before it listens, and fail if it starts instead.
#
expectRefused() {
    local i status

    "${BIN}" --config "$1" >/dev/null 2>&1 &
    PID=$!
    for i in $(seq 1 50); do
        if ! kill -0 "${PID}" 2>/dev/null; then
            wait "${PID}"
            status=$?
            PID=""
            [ "${status}" -ne 0 ] || fail "$1: the server exited with status 0"
            return 0
        fi
        if [ "$(probe)" != "000" ]; then
            CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/admin/secret.txt")
            fail "$1: the server started with an unclosed block and served the protected URI with ${CODE}"
        fi
        sleep 0.2
    done
    fail "$1: the server neither exited nor started"
}

#   Control: the closed route demands credentials
"${BIN}" --config "${WORK}/closed.conf" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 50); do
    [ "$(probe)" != "000" ] && break
    kill -0 "${PID}" 2>/dev/null || fail "the control configuration did not start; see ${WORK}/closed.log"
    sleep 0.2
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/admin/secret.txt")
[ "${CODE}" = "401" ] || fail "control: the closed route answered ${CODE}, not 401"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -u mary:pass2 "http://127.0.0.1:${PORT}/admin/secret.txt")
[ "${CODE}" = "200" ] || fail "control: an authenticated request answered ${CODE}, not 200"
tmStopServer ${PID}
PID=""

expectRefused "${WORK}/unclosed.conf"
grep -q "Unclosed directives in .*unclosed.conf" "${WORK}/unclosed.log" || \
    fail "the log does not name the file with the unclosed block"

expectRefused "${WORK}/include.conf"
grep -q "Unclosed directives in .*admin.conf" "${WORK}/include.log" || \
    fail "the log does not name the included file with the unclosed block"

echo "PASS: a config block left open at end of file stops the server starting"
exit 0
