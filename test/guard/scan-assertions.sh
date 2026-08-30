#!/bin/bash
#
#   scan-assertions.sh - Emit every .tst.ts file that can never assert anything
#
#   A file is inert when, after comments are stripped, neither it nor any local helper module it
#   imports contains a call to a TestMe assertion or to tskip(). basic/dir.tst.ts and
#   stress/hugeForm.tst.ts were exactly that: every assertion commented out, ttrue imported and
#   never called, PASS in 30ms (10062).
#
#   Two subtleties, both learned from false positives:
#
#   - Comments are stripped first, with the same perl pass as scan-gates.sh. An assertion inside
#     a commented-out block is not an assertion, and Appweb's comment style carries no leading
#     "*" on continuation lines, so no line-oriented filter can tell them apart.
#
#   - Relative imports are followed one level, in either quote style -- fast/query.tst.ts
#     writes from "./fast" with double quotes where everything else uses single. security/framing.tst.ts, cgi/query.tst.ts and
#     four others assert entirely through shared helpers (./raw, ./cgi, ./fast). They are the
#     best-designed tests in the suite and must not be reported as inert.
#
set -u
TESTDIR="${1:-.}"

ASSERTIONS='ttrue|tfalse|teq|tneq|tmatch|tcontains|tfail|tskip|teqi|tlti|tgti'

strip() {
    perl -0777 -pe 's{/\*.*?\*/}{ my $c = $&; $c =~ s/[^\n]//g; $c }gse; s{//[^\n]*}{}g' "$1"
}

asserts() {
    strip "$1" | grep -qE "\b($ASSERTIONS)\s*\("
}

find "$TESTDIR" -name '*.tst.ts' -not -path '*/node_modules/*' -not -path '*/.testme/*' \
    -not -path '*/guard/*' | sort | while read -r f; do

    if asserts "$f"; then
        continue
    fi

    #   No direct assertion. Follow relative imports one level before declaring it inert.
    found=""
    for spec in $(strip "$f" | grep -oE "from ['\"]\\.[^'\"]*['\"]" | sed "s/from ['\"]//; s/['\"]$//"); do
        helper="$(dirname "$f")/${spec}.ts"
        if [ -f "$helper" ] && asserts "$helper"; then
            found=1
            break
        fi
    done

    if [ -z "$found" ]; then
        echo "$f"
    fi
done
