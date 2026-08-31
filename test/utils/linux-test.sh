#!/bin/bash
#
#   linux-test.sh - Build and run the suite inside the Linux test container.
#
#   Invoked by bin/test-linux.sh; not useful on its own. Two mounts are in place:
#
#       /src    the host working tree, read only
#       /work   a container volume holding the Linux build
#
#   The tree is staged from /src into /work rather than built in place. build/obj is per platform
#   but build/bin is not (projects/premake5.lua), so a Linux build in the host tree would overwrite
#   the macOS appweb binary and leave make believing it was up to date -- the host suite would then
#   run ELF binaries and fail in a way that looks nothing like its cause. The volume also survives
#   between runs, so the second build is incremental.
#
#   Arguments are passed to tm. With none, "test" runs everything under test/, which is what
#   "make test" does.
#
set -u

if [ ! -d /src ] || [ ! -d /work ] ; then
    echo "      [Error] linux-test.sh runs inside the test container only" >&2
    exit 255
fi

#
#   .testme must be excluded, not merely refreshed. TestMe caches each compiled .tst.c beside its
#   source and reuses it when it is newer than the source, so a host run leaves Mach-O binaries
#   that this container would happily decide were up to date and then fail to exec. That is not a
#   hypothetical: it errored all nine C tests with ENOEXEC on the first run of this script.
#
#
#   .local.mk is not in the repository and is not part of anyone else's build. It is included by the
#   top-level Makefile when present and calls host-only tools -- "make: json: No such file or
#   directory" on every build here until it was excluded. Staging it would also mean this container
#   builds something neither CI nor a customer does.
#
#
#   --delete-excluded, not just --delete: an excluded file is protected from deletion by default, so
#   anything staged by an earlier version of this script would live in the volume forever. The two
#   things the container owns and the host must never supply -- the Linux build and TestMe's compile
#   cache -- are protected explicitly instead.
#
echo "       [Run] stage /src into /work"
rsync -a --delete --delete-excluded \
    --filter 'protect /build/' \
    --filter 'protect .testme/' \
    --exclude '.git' \
    --exclude '.local.mk' \
    --exclude '.testme' \
    --exclude '.testme-pidfile' \
    --exclude '.DS_Store' \
    --exclude 'build' \
    --exclude 'node_modules' \
    --exclude 'doc' \
    /src/ /work/ || exit 255

cd /work || exit 255

echo "       [Run] make build [linux]"
make build || exit 255

#
#   Report what was actually exercised. The image is arm64 and CI's ubuntu runner is x86_64, so
#   this line is the difference between the two results.
#
echo "      [Info] $(uname -s) $(uname -m), $(gcc -dumpversion 2>/dev/null), $(openssl version 2>/dev/null)"

if [ $# -eq 0 ] ; then
    set -- test
fi

echo "       [Run] tm $*"
tm "$@"
