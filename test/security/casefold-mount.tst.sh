#!/bin/bash
#
#   casefold-mount.tst.sh - The case-fold probe reads the document root's own file system
#
#   Whether route matching folds case is probed from the document root. The probe used to re-spell the
#   root's own name, or an ancestor's, and those entries live on the parent file system. A document root
#   that is a mount point was judged by the file system it is mounted on, not by its own.
#
#   macOS only: a case-sensitive disk image mounted under /Volumes, which folds case, is a document root on
#   a file system that does not fold, below one that does. The probe must report that it does not fold, so
#   an upper-case URI is not claimed by the protected route and finds no file.
#
#   The same volume checks FollowSymlinks containment. It compared paths with the platform's case rule, which
#   on macOS folds, so a link to a sibling directory differing only in case was treated as inside the
#   documents. It must use the document root's own rule.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${TESTDIR}/utils/testenv.sh"

BIN="$(tmAppweb "${TESTDIR}/../build/bin")"
PORT=4588
WORK="${TESTDIR}/tmp/casefold-mount"
CONF="${WORK}/casefold.conf"
IMAGE="${WORK}/sensitive.dmg"
VOLUME="appwebcf$$"

fail() { echo "FAIL: $*"; exit 1; }

if [ "$(uname)" != "Darwin" ] || ! command -v hdiutil >/dev/null 2>&1; then
    echo "SKIP: needs hdiutil to mount a case-sensitive volume"
    exit 0
fi
if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

rm -rf "${WORK}"
mkdir -p "${WORK}"

server=""
mount=""
cleanup() {
    trap '' INT TERM QUIT
    if [ -n "${server}" ]; then
        tmStopServer "${server}"
    fi
    if [ -n "${mount}" ]; then
        hdiutil detach -quiet -force "${mount}" >/dev/null 2>&1
    fi
    rm -rf "${WORK}"
    return 0
}
trap cleanup EXIT

hdiutil create -quiet -size 20m -fs "Case-sensitive APFS" -volname "${VOLUME}" "${IMAGE}" || fail "cannot create image"
mount=$(hdiutil attach -nobrowse "${IMAGE}" | awk -F'\t' '/\/Volumes\//{print $NF}')
[ -n "${mount}" ] || fail "cannot attach image"

mkdir -p "${mount}/secret"
echo "protected" > "${mount}/secret/index.html"
echo "public" > "${mount}/index.html"
[ -e "${mount}/SECRET" ] && fail "the image folds case"

start() {
    cat > "${CONF}" <<CONF
ErrorLog ${WORK}/casefold.log level=2
Listen ${PORT}
Documents $1
AddHandler fileHandler html txt ""
DirectoryIndex index.html
FollowSymlinks on

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
}

stop() {
    tmStopServer "${server}"
    server=""
}

status() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PORT}$1" 2>/dev/null; }

#   The document root is the mount point itself
start "${mount}"
exact=$(status /secret/index.html)
[ "${exact}" = "401" ] || fail "the exact spelling must be protected, got ${exact}"

#   The root does not fold, so the variant is not the protected route's and names no file
variant=$(status /SECRET/index.html)
[ "${variant}" = "404" ] || fail "case-variant URI was judged by the parent file system (got ${variant}, expected 404)"
stop

#   A link inside Docs to its case-variant sibling docs is outside the documents on this volume
mkdir -p "${mount}/Docs" "${mount}/docs"
echo "public" > "${mount}/Docs/index.html"
echo "private" > "${mount}/docs/private.html"
ln -s "${mount}/docs/private.html" "${mount}/Docs/escape.html"
start "${mount}/Docs"
escape=$(status /escape.html)
[ "${escape}" = "200" ] && fail "a link to a case-variant sibling was served as inside the documents"
stop

echo "PASS: the document root's own file system decides case folding and containment"
exit 0
