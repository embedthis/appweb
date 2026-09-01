#!/bin/bash
#
#   cors-config-invalid.tst.sh - Invalid CrossOrigin forms fail at startup
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${TESTDIR}/utils/testenv.sh"

BIN="$(tmAppweb "${TESTDIR}/../build/bin")"
PORT=4501
WORK="${TESTDIR}/tmp/cors-config-invalid"

#   Paths that go into the configuration appweb reads, rather than into a shell command
NATIVE_TESTDIR="$(tmNative "${TESTDIR}")"
NATIVE_WORK="$(tmNative "${WORK}")"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}"
trap 'rm -rf "${WORK}"' EXIT

check_rejected() {
    local name="$1"
    local directive="$2"
    local expected="$3"
    local conf="${WORK}/${name}.conf"
    local log="${WORK}/${name}.log"

    cat > "${conf}" <<CONF
ErrorLog ${NATIVE_WORK}/${name}.log level=4
Listen ${PORT}
Documents ${NATIVE_TESTDIR}/web
AddHandler fileHandler html txt ""

<Route ^/cors>
    ${directive}
    Target write 200 "cors"
</Route>
CONF

    if "${BIN}" --config "${conf}" >/dev/null 2>&1; then
        fail "${directive} was accepted"
    fi
    grep -q "${expected}" "${log}" || fail "${directive} did not log ${expected}"
}

check_rejected "missing-origin" "CrossOrigin credentials=yes" "origin= argument is required"
check_rejected "wildcard-credentials" "CrossOrigin origin=* credentials=yes" "credentials requires an explicit non-wildcard origin"
check_rejected "client-credentials" "CrossOrigin origin=client credentials=yes" "credentials requires an explicit non-wildcard origin"

echo "PASS: invalid CrossOrigin configurations were rejected"
exit 0
