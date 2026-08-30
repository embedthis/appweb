#!/bin/bash
#
#   casefold-documents-linux.tst.sh - Run the case-fold probe test on Linux, from macOS
#
#   Why this exists: on macOS the document root always folds case, so the probe always returns "fold"
#   and the case-SENSITIVE branch of detectCaseInsensitiveDocuments() is never executed here. Every
#   local run of casefold-documents.tst.sh therefore exercises one half of the function. This runs the
#   same test, unmodified, against a Linux build in a container so the other half runs too.
#
#   It does NOT reproduce the original defect. That needs a case-folding mount on a platform whose
#   compile-time default is case-sensitive -- vfat, exFAT or SMB on Linux. Neither is available here:
#   the container VM kernel has no vfat module and loop mounts are refused, so ext4 with the casefold
#   feature is out too. What this covers is the branch, not the bug. Stated plainly because a Linux leg
#   that looks like a reproduction and is not would be worse than none.
#
#   Depth-gated: it installs a toolchain and builds Appweb from scratch, which takes minutes. Runs at
#   "tm --depth 1" and above, not in a default run.
#
#   The repo is mounted read only and copied inside the container. Appweb builds into build/bin
#   regardless of platform, so building in place would overwrite the macOS binary the rest of the
#   suite is using.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "${TESTDIR}/.." && pwd)"
IMAGE="docker.io/library/ubuntu:24.04"
DEPTH="${TESTME_DEPTH:-0}"

fail() { echo "FAIL: $*"; exit 1; }

if [ "${DEPTH}" -lt 1 ]; then
    echo "SKIP: depth ${DEPTH}; run with 'tm --depth 1' to build and test on Linux"
    exit 0
fi
if [ "$(uname -s)" != "Darwin" ]; then
    echo "SKIP: already on $(uname -s); casefold-documents.tst.sh covers this natively"
    exit 0
fi
if ! command -v container >/dev/null 2>&1; then
    echo "SKIP: the macOS 'container' CLI is not installed"
    exit 0
fi
if ! container system status >/dev/null 2>&1; then
    echo "SKIP: the container apiserver is not running ('container system start')"
    exit 0
fi

#
#   build-essential and libssl-dev build the server; libfcgi-dev is needed by utils/fastProgram.c;
#   curl is what the test itself drives the server with.
#
script='
set -e
apt-get update -qq >/dev/null 2>&1
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    build-essential libssl-dev libfcgi-dev curl >/dev/null 2>&1

mkdir -p /work
cd /src && tar cf - --exclude=build --exclude=node_modules --exclude=.git --exclude=paks . \
    | (cd /work && tar xf -)

cd /work
make build >/tmp/build.log 2>&1 || { echo "BUILD FAILED"; tail -25 /tmp/build.log; exit 1; }
grep -q "Appweb release .linux." /tmp/build.log || { echo "BUILD DID NOT REPORT LINUX"; tail -5 /tmp/build.log; exit 1; }

mkdir -p /work/tmp/realpath
deep=/work/tmp/realpath/target
while [ ${#deep} -le 1200 ]; do
    deep="${deep}/0123456789abcdef0123456789abcdef"
    mkdir -p "${deep}"
done
echo "realpath-ok" > "${deep}/index.html"
ln -s "${deep}" /work/tmp/realpath/docs-link
cat > /tmp/realpath.conf <<CONF
ErrorLog /tmp/realpath.log level=2
Listen 127.0.0.1:4505
Documents /work/tmp/realpath/docs-link
AddHandler fileHandler html ""
DirectoryIndex index.html
CONF
/work/build/bin/appweb --config /tmp/realpath.conf >/tmp/realpath.out 2>&1 &
pid=$!
for i in $(seq 1 40); do
    curl -fsS -o /dev/null http://127.0.0.1:4505/index.html 2>/dev/null && break
    sleep 0.25
done
curl -fsS http://127.0.0.1:4505/index.html >/tmp/realpath.body 2>/tmp/realpath.curl || {
    echo "REALPATH STARTUP FAILED"
    cat /tmp/realpath.out /tmp/realpath.log /tmp/realpath.curl 2>/dev/null
    kill ${pid} 2>/dev/null || true
    exit 1
}
grep -q "realpath-ok" /tmp/realpath.body || { echo "REALPATH BODY MISMATCH"; cat /tmp/realpath.body; kill ${pid} 2>/dev/null || true; exit 1; }
kill ${pid} 2>/dev/null || true
wait ${pid} 2>/dev/null || true

#   Report what the file system actually does, so a passing run says which branch it took
if [ -e /work/test/WEB ]; then echo "note: container file system folds case"; else echo "note: container file system is case sensitive"; fi

cd /work/test
bash security/casefold-documents.tst.sh
'

out=$(container run --rm --volume "${ROOT}:/src:ro" "${IMAGE}" sh -c "${script}" 2>&1)
status=$?

echo "${out}"
[ ${status} -eq 0 ] || fail "the Linux run failed (exit ${status})"
echo "${out}" | grep -q "^PASS:" || fail "the Linux run did not report a PASS from casefold-documents.tst.sh"

#
#   The point of the exercise: Linux must take the case-sensitive branch that macOS never reaches. If
#   the container ever reports folding, this leg has stopped covering what it was added for.
#
echo "${out}" | grep -q "case sensitive" || \
    fail "expected a case-sensitive file system on Linux; this leg no longer covers the branch macOS cannot reach"

echo "PASS: the case-fold probe took the case-sensitive branch on Linux"
exit 0
