#!/bin/bash
#
#   check-amalgamation.sh - Verify the amalgamated sources match their pak sources
#
#   src/http/httpLib.c and src/mpr/mprLib.c are generated from paks/http/dist and paks/mpr/dist by
#   "make cache" and "pak sync". Nothing verified they still matched (10070). The upstream suites
#   test the upstream sources, and Appweb's suite does not run them, so a dropped or mangled hunk
#   would be caught only by whatever functional coverage happens to touch the damaged code.
#
#   Every file "pak sync" overwrites must be listed below, not just the two big amalgamations.
#   src/osdep/osdep.h was omitted and diverged unnoticed: it holds compile-time platform gating, so
#   a reverted hunk there does not fail a test -- it changes which targets build at all. A file this
#   script does not name is a file the guard does not guard.
#
#   paks/ is gitignored, so it is absent in a fresh clone and in every git worktree. That is a
#   skip, not a failure -- but a loud one, reported on stdout and distinguished by exit code, so
#   "nothing to check" is never mistaken for "everything matched".
#
#   Exit codes:  0 verified   2 skipped, paks absent   1 divergent or malformed
#
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if [ ! -d "$ROOT/paks" ]; then
    echo "SKIP: paks/ is absent (gitignored; run 'pak install' in a full checkout to enable)"
    exit 2
fi

status=0
checked=0

check() {
    local pak="$1" src="$2"
    if [ ! -f "$ROOT/$pak" ]; then
        echo "FAIL: $pak is absent, so $src cannot be verified"
        status=1
        return
    fi
    if [ ! -f "$ROOT/$src" ]; then
        echo "FAIL: $src is absent"
        status=1
        return
    fi
    checked=$((checked + 1))
    if ! cmp -s "$ROOT/$pak" "$ROOT/$src"; then
        echo "FAIL: $src differs from $pak"
        diff "$ROOT/$pak" "$ROOT/$src" | head -20
        status=1
    fi
}

check paks/http/dist/httpLib.c  src/http/httpLib.c
check paks/http/dist/http.h     src/http/http.h
check paks/http/dist/http.c     src/http/http.c
check paks/mpr/dist/mprLib.c    src/mpr/mprLib.c
check paks/mpr/dist/mpr.h       src/mpr/mpr.h
check paks/osdep/dist/osdep.h   src/osdep/osdep.h

#   A run that checked nothing must not report success
if [ "$checked" -eq 0 ]; then
    echo "FAIL: paks/ exists but nothing was checked"
    exit 1
fi

if [ "$status" -eq 0 ]; then
    echo "OK: $checked amalgamated file(s) match their pak sources"
fi
exit $status
