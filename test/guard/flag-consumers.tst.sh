#!/usr/bin/env bash
#
#   flag-consumers.tst.sh - Every feature flag the build sets is consumed, and <if PAM> tells the truth
#
#   1. Each define in the projects/premake5.lua feature table must appear in a preprocessor conditional
#      under src/. A flag nothing reads cannot compile anything out, whatever an integrator believes.
#   2. The <if PAM> configuration conditional must require ME_COMPILER_HAS_PAM, the guard the PAM auth
#      store is compiled under. Otherwise it is true on platforms where "AuthStore system" is refused.
#
set -u
TOP=$(cd "$(dirname "$0")/../.." && pwd)
rc=0
flags=$(grep -oE 'define = "ME_(COM|HTTP)_[A-Z0-9_]+"' "$TOP/projects/premake5.lua" | cut -d'"' -f2 | sort -u)
if [ -z "${flags}" ] ; then
    echo "FAIL: no feature table found in projects/premake5.lua" ; exit 1
fi
for flag in ${flags} ; do
    #   An #ifndef default alone is not a consumer
    if ! grep -rqE "^[[:space:]]*#[[:space:]]*(if|elif)[[:space:]].*\b$flag\b" "$TOP/src" --include='*.c' --include='*.h' ; then
        echo "FAIL: $flag is set by premake5.lua but no #if consumes it" ; rc=1
    fi
done
#   A flag emitted outside the table escapes --without
if grep -qE '"ME_(COM_(CGI|FAST|PROXY)|HTTP_[A-Z0-9_]+)=[01]"' "$TOP/projects/premake5.lua" ; then
    echo "FAIL: premake5.lua sets a feature define outside the feature table" ; rc=1
fi
if ! grep -A2 'scaselessmatch(key, "PAM")' "$TOP/src/config.c" | grep -q 'ME_COMPILER_HAS_PAM' ; then
    echo "FAIL: <if PAM> does not require ME_COMPILER_HAS_PAM" ; rc=1
fi
[ $rc -eq 0 ] && echo "PASS: flags consumed"
exit $rc
