#!/bin/bash
#
#   prep.sh - TestMe setup script to start web
#

#
#   Services run with the cwd of the config group that invokes them. Always run from the
#   test directory so the web, cgi-bin and fast-bin trees are created in the right place.
#
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

#
#   BIN is exported by the top-level Makefile. It is not set when running "tm" directly,
#   so fall back to the build directory relative to this script.
#
BIN="${BIN:-$(cd ../build/bin 2>/dev/null && pwd)}"
BIN=$(cd "$(dirname "${BIN}")" && pwd)/$(basename "${BIN}")

if [ "$TESTME_OS" = "windows" ] ; then
    EXE=".exe"
    (cd .. ; test/utils/prep-test.bat)
else
    EXE=""
    (cd .. ; test/utils/prep-test.sh)
fi

mkdir -p cgi-bin fast-bin web/tmp

#
#   Install a program fixture.
#
#   The rm is load bearing on macOS/arm64. Copying over an existing executable reuses its inode, and
#   the kernel still holds the code-signature verdict it cached for the previous contents -- so the
#   new binary is SIGKILLed at exec. The symptom is not a permission error: the CGI program simply
#   produces nothing and the request returns 200 with an empty body, which reads as a server bug
#   rather than a fixture one. It cost a long bisect. Removing first gives a fresh inode.
#
install_program() {
    rm -f "$2"
    cp "$1" "$2" || return 1
    chmod 755 "$2"
}

#
#   Test PKI and revocation lists for the mTLS revocation tests. Generates pki/revoke.conf which
#   appweb.conf includes with a glob, so a failure here costs those tests and nothing else.
#
utils/make-pki.sh

if [ ! -f web/1K.txt ]; then
    echo '   [Create] test files'
    utils/make-files 20 web/1K.txt
    utils/make-files 205 web/10K.txt
    utils/make-files 512 web/25K.txt
    utils/make-files 2050 web/100K.txt
    :
fi
#   utils/make-files 10250 web/500K.txt
#   utils/make-files 21000 web/1M.txt
#   utils/make-files 210000 web/10M.txt

#
#   Reinstall the program fixtures every run, rather than only when cgi-bin/testScript is absent.
#   cleanup.sh empties cgi-bin but leaves the copies under web/, so the old guard could not refresh
#   those: once web/cgiProgram.cgi was stale or unrunnable, no later run replaced it.
#
if [ -f "${BIN}/cgiProgram${EXE}" ]; then
    echo '   [Create] testScript'
    cgiProgram="${BIN}/cgiProgram${EXE}"
    rm -f cgi-bin/testScript
    echo "#!${cgiProgram}" > cgi-bin/testScript
    chmod 755 cgi-bin/testScript

    install_program "${cgiProgram}" "cgi-bin/cgiProgram${EXE}"
    install_program "${cgiProgram}" "cgi-bin/nph-cgiProgram${EXE}"
    install_program "${cgiProgram}" "cgi-bin/cgi Program${EXE}"
    install_program "${cgiProgram}" "web/cgiProgram.cgi"
    install_program "${cgiProgram}" "web/upload/cgiProgram.cgi"
else
    echo "   [Warn] ${BIN}/cgiProgram${EXE} is missing; the CGI tests cannot pass"
fi

if [ -f "${BIN}/fastProgram${EXE}" ]; then
    echo '   [Create] fastProgram'
    fastProgram="${BIN}/fastProgram${EXE}"
    install_program "${fastProgram}" "fast-bin/fastProgram${EXE}"
    install_program "${fastProgram}" "fast-bin/fast Program${EXE}"
fi

if [ ! -f auth.conf ]; then
    echo '   [Create] auth.conf'
    echo '#\n#   auth.conf - Authorization roles and users\n#\n\n' > auth.conf
    "${BIN}/authpass" --file auth.conf --cipher md5 --password pass4 example.com julie user
    "${BIN}/authpass" --file auth.conf --cipher md5 --password pass3 example.com peter user
    "${BIN}/authpass" --file auth.conf --cipher md5 --password pass2 example.com mary user executive
    "${BIN}/authpass" --file auth.conf --cipher md5 --password pass1 example.com joshua user administrator purchase
    "${BIN}/authpass" --file auth.conf --cipher blowfish --password pass5 example.com ralph user administrator purchase
fi
