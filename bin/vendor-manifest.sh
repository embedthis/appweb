#!/bin/bash
#   vendor-manifest.sh - Record or verify vendored file hashes and pak versions in src/vendor.sha256.
#   Usage: bin/vendor-manifest.sh write|verify
#   Verification needs no paks directory, network or Git.

set -u
unset CDPATH

TOP=$(cd "$(dirname "$0")/.." && pwd)
cd "$TOP"

MANIFEST=src/vendor.sha256

#   pak name and the directory pak sync writes it into
PAKS="certs:certs http:src/http makerom:src/makerom mpr:src/mpr osdep:src/osdep watchdog:src/watchdog"

#   Vendored files outside those directories: the API reference "make import" copies from each pak
VENDORED="doc/api/http.html doc/api/mpr.html doc/api/osdep.html"

if command -v shasum >/dev/null 2>&1; then
    SHA="shasum -a 256"
else
    SHA="sha256sum"
fi

hashFile() {
    $SHA "$1" | cut -d' ' -f1
}

write() {
    local entry name dir version versions=""
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        echo "vendor-manifest: write needs a git checkout to list the vendored files" >&2
        exit 1
    fi
    for entry in $PAKS; do
        name=${entry%%:*}
        version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "paks/$name/package.json" 2>/dev/null | head -1)
        if [ -z "$version" ]; then
            echo "vendor-manifest: no version in paks/$name/package.json -- run pak sync first" >&2
            exit 1
        fi
        versions="${versions}pak $name $version"$'\n'
    done
    {
        echo "# vendor.sha256 -- vendored pak files and the pak versions they were imported from"
        echo "# Written by \"make import\". Checked by \"make verify\". Do not edit."
        printf '%s' "$versions"
        for entry in $PAKS; do
            dir=${entry#*:}
            #   CLAUDE.md is not part of the product and does not ship in the archive
            git ls-files "$dir" | grep -v '/CLAUDE\.md$' | LC_ALL=C sort | while read -r f; do
                echo "$(hashFile "$f")  $f"
            done
        done
        for f in $VENDORED; do
            echo "$(hashFile "$f")  $f"
        done
    } > "$MANIFEST.tmp"
    mv "$MANIFEST.tmp" "$MANIFEST"
    echo "vendor-manifest: wrote $MANIFEST ($(grep -c '^[0-9a-f]' "$MANIFEST") files)"
}


verify() {
    local status=0 checked=0 hash file entry
    if [ ! -f "$MANIFEST" ]; then
        echo "FAIL: $MANIFEST is absent"
        exit 1
    fi
    while read -r hash file; do
        case "$hash" in
        '#'*|pak|'') continue ;;
        esac
        checked=$((checked + 1))
        if [ ! -f "$file" ]; then
            echo "FAIL: $file is listed in $MANIFEST but absent"
            status=1
        elif [ "$(hashFile "$file")" != "$hash" ]; then
            echo "FAIL: $file differs from the pak it was imported from -- fix it upstream and run make import"
            status=1
        fi
    done < "$MANIFEST"
    if [ "$checked" -eq 0 ]; then
        echo "FAIL: $MANIFEST lists no files"
        exit 1
    fi
    #   In a checkout, a vendored file committed without "make import" is not in the manifest
    if git rev-parse --git-dir >/dev/null 2>&1; then
        {
            for entry in $PAKS; do
                git ls-files "${entry#*:}" | grep -v '/CLAUDE\.md$'
            done
            printf '%s\n' $VENDORED
        } | while read -r file; do
            grep -q "  $file\$" "$MANIFEST" || echo "FAIL: $file is vendored but not in $MANIFEST -- run make import"
        done | grep . && status=1
    fi
    if [ "$status" -eq 0 ]; then
        echo "OK: $checked vendored file(s) match $MANIFEST"
    fi
    return $status
}

case "${1:-verify}" in
write)  write ;;
verify) verify ;;
*)      echo "usage: $0 [write|verify]" >&2; exit 1 ;;
esac
