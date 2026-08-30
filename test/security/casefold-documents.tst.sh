#!/bin/bash
#
#   casefold-documents.tst.sh - The case-fold probe must not be defeated by the document root's name
#
#   Route selection compares the request path against the route literal, and that comparison gates
#   route authentication. It must agree with the file system: where the file system folds case, an
#   upper-case spelling of a protected URI has to reach the route that guards it, or it falls through
#   to whatever route matches next and is served with no credentials.
#
#   Whether to fold is probed from the document root rather than chosen by platform. The probe
#   re-spells one path component with its case flipped and compares inodes -- so it needs a component
#   with a letter in it. A document root named after a port number has none. That used to fall back to
#   the compile-time default, which on Linux is case-sensitive: the bypass, reachable by naming a
#   directory "8080".
#
#   This test uses a document root named entirely of digits. It asserts consistency, not a fixed
#   verdict: on a folding file system the case-variant URI must reach the same protected route as the
#   exact spelling, and on a non-folding one it must not resolve at all. What it rejects is the third
#   outcome -- the variant resolving to a DIFFERENT, unprotected route.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4504
WORK="${TESTDIR}/tmp/casefold-documents"
CONF="${WORK}/casefold.conf"
DOCS="${WORK}/8080"

fail() { echo "FAIL: $*"; exit 1; }

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${DOCS}/secret"

server=""
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        kill -TERM "${server}" 2>/dev/null
        sleep 0.5
        kill -KILL "${server}" 2>/dev/null
    fi
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

echo "protected" > "${DOCS}/secret/index.html"
echo "public" > "${DOCS}/index.html"

#   Does this file system fold case? Ask it the same way the server does.
if [ -e "${DOCS}/SECRET" ]; then
    folds=1
else
    folds=0
fi

cat > "${CONF}" <<CONF
ErrorLog ${WORK}/casefold.log level=2
Listen ${PORT}
Documents ${DOCS}
AddHandler fileHandler html txt ""
DirectoryIndex index.html

<Route ^/secret/>
    AuthType basic example.com
    Require valid-user
</Route>
CONF

perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die' "${BIN}" --config "${CONF}" >/dev/null 2>&1 &
server=$!

for _ in $(seq 1 40); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null && break
    sleep 0.25
done
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/index.html" 2>/dev/null || fail "server did not start"

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PORT}$1" 2>/dev/null; }

exact=$(status /secret/index.html)
[ "${exact}" = "401" ] || fail "the exact spelling must be protected, got ${exact}"

variant=$(status /SECRET/index.html)
if [ "${folds}" = "1" ]; then
    #   The file system serves it, so the route that guards it must claim it too
    [ "${variant}" = "401" ] || fail "case-variant URI bypassed the protected route on a folding file system (got ${variant}); the document root's digits-only name defeated the probe"
    echo "PASS: folding file system, /SECRET/ is claimed by the protected route (401)"
else
    #   Nothing to serve, so anything but a success is correct
    case "${variant}" in
    2*) fail "case-variant URI served content on a non-folding file system (got ${variant})" ;;
    esac
    echo "PASS: non-folding file system, /SECRET/ does not resolve (${variant})"
fi
exit 0
