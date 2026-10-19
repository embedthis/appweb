#!/usr/bin/env bash
#   stripComments.sh - Strip HTML comments from stdin to stdout; fail on unterminated comments.

set -e

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

perl -0777 -pe 's/<!--.*?-->\n?//gs' > "$tmp"

if grep -q -e '<!--' -e '-->' "$tmp" ; then
    echo "unbalanced HTML comment" >&2
    exit 1
fi
cat "$tmp"
