#!/bin/bash
#   Unsupported Route, Param and RequestHeader patterns must fail at startup.

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${TESTDIR}/utils/testenv.sh"

BIN="$(tmAppweb "${TESTDIR}/../build/bin")"
PORT=4542
WORK="${TESTDIR}/tmp/pattern-reject"

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

configure() {
    local name="$1"
    local route="$2"
    local directive="$3"

    cat > "${WORK}/${name}.conf" <<CONF
ErrorLog ${NATIVE_WORK}/${name}.log level=2
Listen 127.0.0.1:${PORT}
Documents ${NATIVE_TESTDIR}/web
AddHandler fileHandler html txt ""

<Route ${route}>
    ${directive}
    AuthType basic example.com
    Require valid-user
</Route>
CONF
}

#   The server must exit with an error. A server still running after the wait accepted the configuration.
check_rejected() {
    local name="$1"
    local pattern="$2"
    local pid i

    configure "${name}" "$3" "$4"
    "${BIN}" --config "${WORK}/${name}.conf" >/dev/null 2>&1 &
    pid=$!
    for ((i = 0; i < 50; i++)); do
        kill -0 ${pid} 2>/dev/null || break
        sleep 0.1
    done
    if kill -0 ${pid} 2>/dev/null; then
        kill -9 ${pid}
        fail "${name} was accepted"
    fi
    wait ${pid} && fail "${name} exited with success"
    grep -qF "${pattern}" "${WORK}/${name}.log" || fail "${name} did not name the pattern ${pattern}"
}

check_rejected route-invalid '^/admin(/' '^/admin(/' 'SetHandler fileHandler'
check_rejected param-invalid 'role(' '^/p/' 'Param role role('
check_rejected header-invalid 'acme(' '^/h/' 'RequestHeader X-Tenant acme('

#   Needs a regular expression engine, so fails in builds without PCRE2
if ! grep -qs pcre2_compile "${TESTDIR}/../build/bin/"*; then
    check_rejected route-regex '^/admin[0-9]/' '^/admin[0-9]/' 'SetHandler fileHandler'
    check_rejected param-regex '^admin[0-9]$' '^/p/' 'Param role ^admin[0-9]$'
    check_rejected header-regex '^[a-z]+$' '^/h/' 'RequestHeader X-Tenant ^[a-z]+$'
fi

echo "PASS: uncompilable patterns were rejected at startup"
exit 0
