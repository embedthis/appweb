#!/bin/bash
#
#   test-linux.sh - Run the Appweb unit test suite under Linux on a macOS host
#
#   Linux was previously reachable only through a CI round trip: push, wait, read a log. That is a
#   poor loop for a defect that only appears on Linux -- epoll, sendfile, glibc, /proc -- and it is
#   no loop at all for a change being iterated on. Apple's "container" tool runs a real Linux VM
#   locally, so the same build and the same suite CI runs can run here in about the time a local
#   build takes.
#
#   Two properties of the container are worth having for their own sake, beyond Linux coverage:
#
#   - The suite's ports (4100, 4443, 5443, 6443, 7443, 8443-8448) are bound inside the container's
#     own network namespace, so a stray appweb on the host cannot collide with them and a stray
#     appweb in a container dies with the container.
#   - There is no macOS sandbox in a Linux VM. Running the suite under seatbelt fails around 25
#     static-file tests because sendfile(2) is denied; here that class does not exist.
#
#   ARCHITECTURE. Apple's container runs arm64 Linux and does not emulate x86_64. CI's
#   ubuntu-latest runner is x86_64. This gets Linux coverage, not CI parity -- most obviously,
#   plain char is unsigned on ARM and signed on x86, and the suite compiles its C tests with
#   -Wsign-conversion. Treat a green run here as necessary, not sufficient.
#
#   Usage:
#       bin/test-linux.sh                   build the image if needed, then run the whole suite
#       bin/test-linux.sh auth              pass anything else through to tm
#       bin/test-linux.sh --depth 2
#       bin/test-linux.sh --rebuild         force the image to be rebuilt first
#       bin/test-linux.sh --clean           discard the Linux build volume first
#
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${APPWEB_LINUX_IMAGE:-appweb-linux-test}"
VOLUME="${APPWEB_LINUX_VOLUME:-appweb-linux-build}"
DOCKERFILE="${ROOT}/test/utils/Dockerfile.linux"
STAMP="${ROOT}/build/linux-image.sha"

CPUS="${APPWEB_LINUX_CPUS:-4}"
MEMORY="${APPWEB_LINUX_MEMORY:-4G}"

REBUILD=0
CLEAN=0
ARGS=()
for arg in "$@"; do
    case "$arg" in
        --rebuild) REBUILD=1 ;;
        --clean) CLEAN=1 ;;
        *) ARGS+=("$arg") ;;
    esac
done

if ! command -v container >/dev/null 2>&1 ; then
    echo "      [Error] Apple's container tool is not installed" >&2
    echo "              See https://github.com/apple/container -- macOS 26 or later on Apple silicon" >&2
    exit 255
fi

if ! container system status >/dev/null 2>&1 ; then
    echo "       [Run] container system start"
    container system start || exit 255
fi

#
#   The image carries only the toolchain, so it is rebuilt when its Dockerfile changes and not when
#   the source does. The checksum is kept under build/, which "make clean" removes -- a clean tree
#   then rebuilds the image once, which is the safe direction to be wrong in.
#
WANT="$(shasum -a 256 "${DOCKERFILE}" | cut -d' ' -f1)"
HAVE=""
[ -f "${STAMP}" ] && HAVE="$(cat "${STAMP}")"

if ! container image inspect "${IMAGE}" >/dev/null 2>&1 ; then
    REBUILD=1
elif [ "${WANT}" != "${HAVE}" ] ; then
    REBUILD=1
fi

if [ ${REBUILD} -ne 0 ] ; then
    echo "       [Run] build ${IMAGE}"
    container build -t "${IMAGE}" -f "${DOCKERFILE}" "${ROOT}/test/utils" || exit 255
    mkdir -p "${ROOT}/build"
    echo "${WANT}" > "${STAMP}"
fi

#
#   The Linux build lives in a volume rather than in the host tree. build/obj is per platform but
#   build/bin is not, so a Linux build in the host tree would overwrite the macOS binaries and make
#   would then consider them up to date. Keeping the volume between runs is also what makes the
#   second run an incremental build.
#
if [ ${CLEAN} -ne 0 ] ; then
    echo "       [Run] delete volume ${VOLUME}"
    container volume delete "${VOLUME}" >/dev/null 2>&1
fi

if ! container volume inspect "${VOLUME}" >/dev/null 2>&1 ; then
    echo "       [Run] create volume ${VOLUME}"
    container volume create "${VOLUME}" >/dev/null || exit 255
fi

container run --rm \
    --cpus "${CPUS}" \
    --memory "${MEMORY}" \
    -v "${ROOT}:/src:ro" \
    -v "${VOLUME}:/work" \
    -w /work \
    "${IMAGE}" \
    bash /src/test/utils/linux-test.sh ${ARGS[@]+"${ARGS[@]}"}
