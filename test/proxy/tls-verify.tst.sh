#!/bin/bash
#
#   tls-verify.tst.sh - <ProxyConfig> TLS settings must reach the outbound connection
#
#   Appweb is a TLS client as well as a TLS server: "ProxyConnect <backend> ssl" dials the backend over
#   TLS, and a <ProxyConfig> block carries that connection's trust anchor, client certificate and
#   cipher policy.
#
#   Two things went wrong, and only one of them was what #10317 described.
#
#   checkSsl() built the block's SSL object in server mode, where verifyPeer defaults off, because it
#   had no way to know it was called from inside <ProxyConfig>. That is real and is fixed. It was not,
#   however, reachable: the object never arrived at the outbound connection in any ordering, so the
#   backend was always verified. See the ticket for the measurements.
#
#   What was reachable is that the block's settings were silently discarded when <ProxyConfig> was
#   written before ProxyConnect. proxyCloseConfigDirective attached them to the Proxy of the inherited
#   route the block creates -- a route discarded at maPopState -- and ProxyConnect then allocated a
#   fresh Proxy on the enclosing route and defaulted its SSL to the public system roots. An operator
#   pinning a private CA, or presenting a client certificate for mTLS to the backend, got neither, with
#   nothing in the log to say so. Case 4 is that defect: it fails before the fix and passes after.
#
#   The other four cases are guards. They passed before the fix too and are here to keep it that way --
#   in particular case 2, which is what breaks if "verify the backend" is ever implemented without a
#   trust anchor to verify against.
#
#   certs/self.crt is self-signed. certs/test.crt is signed by certs/ca.crt. Both are CN=localhost.
#
set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
TOP="$(cd "${TESTDIR}/.." && pwd)"
BIN="${TOP}/build/bin/appweb"
CERTS="${TOP}/certs"
WORK="${TESTDIR}/tmp/tls-verify"
BACK_PORT=4506
FRONT_PORT=4507
BACKEND=""
FRONT=""

fail() { echo "FAIL: $*"; exit 1; }
pass() { echo "PASS: $*"; }

cleanup() {
    local status=$?
    [ -n "${FRONT}" ] && kill -9 "${FRONT}" 2>/dev/null
    [ -n "${BACKEND}" ] && kill -9 "${BACKEND}" 2>/dev/null
    rm -rf "${WORK}"
    exit $status
}

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi
if [ ! -f "${CERTS}/self.crt" ] || [ ! -f "${CERTS}/test.crt" ]; then
    echo "SKIP: test certificates are not present in ${CERTS}"
    exit 0
fi

trap cleanup EXIT
rm -rf "${WORK}"
mkdir -p "${WORK}"

#
#   Start a TLS backend using the named certificate. $1 is the basename under certs/.
#
start_backend() {
    local cert="$1"

    [ -n "${BACKEND}" ] && kill -9 "${BACKEND}" 2>/dev/null
    cat > "${WORK}/backend.conf" <<EOF
ErrorLog ${WORK}/backend-error.log level=0
ListenSecure 127.0.0.1:${BACK_PORT}
Documents ${TESTDIR}/web
SSLCertificateFile ${CERTS}/${cert}.crt
SSLCertificateKeyFile ${CERTS}/${cert}.key
ExitTimeout 5secs
EOF
    "${BIN}" --config "${WORK}/backend.conf" >/dev/null 2>&1 &
    BACKEND=$!
    for i in $(seq 1 40); do
        if curl -sk -o /dev/null "https://127.0.0.1:${BACK_PORT}/index.html" 2>/dev/null; then
            return 0
        fi
        sleep 0.25
    done
    fail "TLS backend with ${cert}.crt did not start on ${BACK_PORT}"
}

#
#   Start the proxy front end. $1 is any extra directive to place inside <ProxyConfig>.
#
start_front() {
    local extra="${1:-}"
    local order="${2:-connect-first}"
    local connect="    ProxyConnect localhost:${BACK_PORT} ssl"
    local block="    <ProxyConfig>
        ${extra}
        SSLCACertificateFile ${CERTS}/ca.crt
    </ProxyConfig>"
    local body

    #
    #   Both orderings must behave identically. ProxyConnect used to adopt whatever SSL object the
    #   enclosing route had -- a listener's, outside a ProxyConfig block -- and to overwrite the
    #   block's object when it came second.
    #
    if [ "${order}" = "connect-first" ]; then
        body="${connect}
${block}"
    else
        body="${block}
${connect}"
    fi

    [ -n "${FRONT}" ] && kill -9 "${FRONT}" 2>/dev/null
    cat > "${WORK}/front.conf" <<EOF
ErrorLog ${WORK}/front-error.log level=0
Listen 127.0.0.1:${FRONT_PORT}
Documents ${TESTDIR}/web
ExitTimeout 5secs

<Route ^/proxy/(.*)\$>
    Reset pipeline
    SetHandler proxyHandler
    Prefix /proxy
${body}
</Route>
EOF
    "${BIN}" --config "${WORK}/front.conf" >/dev/null 2>&1 &
    FRONT=$!
    for i in $(seq 1 40); do
        code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONT_PORT}/index.html" 2>/dev/null)
        if [ -n "$code" ] && [ "$code" != "000" ]; then
            return 0
        fi
        sleep 0.25
    done
    fail "proxy front end did not start on ${FRONT_PORT}"
}

proxied() {
    curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
        "http://127.0.0.1:${FRONT_PORT}/proxy/index.html" 2>/dev/null
}

#
#   1. A backend presenting a self-signed certificate that ca.crt did not sign must be refused.
#
start_backend self
start_front ""
code=$(proxied)
[ "$code" != "200" ] || fail "an untrusted backend certificate was accepted (200) -- the proxy TLS leg is not verifying"
[ "$code" = "502" ] || echo "NOTE: expected 502, got ${code} -- refused, but not through the gateway-error path"
pass "an untrusted backend certificate is refused (${code})"

#
#   2. A backend whose certificate ca.crt did sign must still be served. This is the half that would
#      break real deployments if the fix were simply "always verify with no trust anchor".
#
start_backend test
start_front "" connect-first
code=$(proxied)
[ "$code" = "200" ] || fail "a trusted backend certificate was refused (${code}) -- the fix broke working proxying"
pass "a trusted backend certificate is served (200)"

#
#   3. SSLVerifyClient off inside <ProxyConfig> remains a working, explicit opt-out. It is no longer
#      the silent default, but an operator who means it must still be able to say it.
#
start_backend self
start_front "SSLVerifyClient off"
code=$(proxied)
[ "$code" = "200" ] || fail "SSLVerifyClient off did not disable backend verification (${code})"
pass "SSLVerifyClient off is still an explicit opt-out (200)"

#
#   4 and 5. The same two outcomes with <ProxyConfig> written before ProxyConnect. This is the pair
#      that matters: case 4 failed before the fix. The block's trust anchor was discarded and replaced
#      by a default client object using the public system roots, so a backend behind a private CA was
#      refused for a reason the configuration does not suggest -- and a backend whose certificate
#      chains to any public CA would have been accepted in place of the pinned one.
#
start_backend test
start_front "" block-first
code=$(proxied)
[ "$code" = "200" ] || fail "a trusted backend was refused (${code}) when <ProxyConfig> preceded ProxyConnect"
pass "a trusted backend is served with <ProxyConfig> written first (200)"

start_backend self
start_front "" block-first
code=$(proxied)
[ "$code" != "200" ] || fail "an untrusted backend was accepted when <ProxyConfig> preceded ProxyConnect"
pass "an untrusted backend is refused with <ProxyConfig> written first (${code})"

exit 0
