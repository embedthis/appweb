#!/bin/bash
#
#   scan-groups.sh - Report every configuration group and whether it runs
#
#   The runner splits the suite across a group per testme.json5. A group can be absent from a run
#   for three quite different reasons -- disabled outright, marked manual, or its setup failed --
#   and the summary line reports none of them: it counts what ran and says nothing about what did
#   not. A run that executed 78 of 137 tests and one that executed all of them both print PASSED
#   (10069).
#
#   Emits one line per group: "<dir> <enabled|manual|disabled>".
#
set -u
TESTDIR="${1:-.}"

find "$TESTDIR" -name testme.json5 -not -path '*/node_modules/*' -not -path '*/.testme/*' |
    sort | while read -r f; do
    dir="$(dirname "$f")"
    #
    #   Quote the prefix. Unquoted, the expansion is a pattern, so the backslashes in a Windows
    #   TESTDIR (C:\ws\appweb\test) are read as escapes and the pattern becomes C:wsappwebtest/,
    #   which matches nothing -- every group was then reported by its full path and none of them
    #   matched the names the guard records, so the guard failed on its own path handling.
    #
    dir="${dir#"$TESTDIR"/}"
    [ "$dir" = "$TESTDIR" ] && dir="."

    #   enable: false | enable: 'manual' | absent (enabled)
    if grep -qE "^[[:space:]]*enable:[[:space:]]*false" "$f"; then
        echo "$dir disabled"
    elif grep -qE "^[[:space:]]*enable:[[:space:]]*['\"]manual['\"]" "$f"; then
        echo "$dir manual"
    else
        echo "$dir enabled"
    fi
done
