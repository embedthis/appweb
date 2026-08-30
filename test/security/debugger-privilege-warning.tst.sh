#!/bin/bash
#
#   debugger-privilege-warning.tst.sh - --debugger must announce skipped privilege drops
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4504
HOST="127.0.0.1:${PORT}"
WORK="${TESTDIR}/tmp/debugger-privilege-warning"
CONF="${WORK}/appweb.conf"
ERRORS="${WORK}/error.log"
SERVER=""

fail() { echo "FAIL: $*"; cleanup; exit 1; }
pass() { echo "PASS: $*"; }

cleanup() {
    local status=$?
    if [ -n "${SERVER}" ]; then
        kill -9 "${SERVER}" 2>/dev/null
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

cat > "${CONF}" <<CONF
ErrorLog ${ERRORS} level=4
Listen ${PORT}
Documents ${TESTDIR}/web
AddHandler fileHandler html txt ""

UserAccount nobody
GroupAccount nobody
CONF

"${BIN}" --debugger --config "${CONF}" >/dev/null 2>&1 &
SERVER=$!

up=""
for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://${HOST}/index.html" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
        up=1
        break
    fi
    sleep 0.25
done
[ -n "$up" ] || fail "server did not start with --debugger"

grep -q 'UserAccount nobody ignored: --debugger suppresses the privilege drop' "${ERRORS}" ||
    fail "missing UserAccount --debugger warning"
grep -q 'GroupAccount nobody ignored: --debugger suppresses the privilege drop' "${ERRORS}" ||
    fail "missing GroupAccount --debugger warning"

pass "--debugger privilege-drop skips were logged"
exit 0
