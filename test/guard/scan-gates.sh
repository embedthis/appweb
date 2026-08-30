#!/bin/bash
#
#   scan-gates.sh - Emit every live thas() call site under test/ as file:line:flag
#
#   Comments are stripped first. Appweb's multi-line comment style carries no leading "*" on
#   continuation lines, so a gate named in prose is indistinguishable from a live gate by any
#   line-oriented filter. The perl pass replaces each block comment with its own newlines, so
#   line numbers survive the strip and still point at the real source line.
#
set -u
TESTDIR="${1:-.}"

#   The guard directory is excluded: its own sources name thas() in string literals in order to
#   search for it, and matching those would make the guard permanently fail on itself.
find "$TESTDIR" -name '*.tst.ts' -not -path '*/node_modules/*' -not -path '*/.testme/*' \
    -not -path '*/guard/*' | sort | while read -r f; do
    perl -0777 -pe 's{/\*.*?\*/}{ my $c = $&; $c =~ s/[^\n]//g; $c }gse; s{//[^\n]*}{}g' "$f" |
        grep -n "thas(" |
        sed "s|^|${f}:|"
done
