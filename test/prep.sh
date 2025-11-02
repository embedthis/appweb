#!/bin/bash
#
#   prep.sh - TestMe setup script to start web
#

BIN=`realpath ${BIN}`

if [ "$TESTME_OS" = "windows" ] ; then
    EXE=".exe"
    utils/prep-test.bat
else
    EXE=""
    utils/prep-test.sh
fi


mkdir -p cgi-bin fast-bin web/tmp

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

if [ ! -f cgi-bin/testScript -o ! -f ${BIN}/cgiProgram${EXE} ]; then
    echo '   [Create] testScript'
    cgiProgram="${BIN}/cgiProgram${EXE}"
    echo "#!${cgiProgram}" > cgi-bin/testScript
    chmod 755 cgi-bin/testScript

    cp "${cgiProgram}" "cgi-bin/cgiProgram${EXE}"
    cp "${cgiProgram}" "cgi-bin/nph-cgiProgram${EXE}"
    cp "${cgiProgram}" "cgi-bin/cgi Program${EXE}"
    cp "${cgiProgram}" "web/cgiProgram.cgi"
    cp "${cgiProgram}" "web/upload/cgiProgram.cgi"
fi

if [ ! -f fast-bin/fastProgram${EXE} -a -f ${BIN}/fastProgram${EXE} ]; then
    echo '   [Create] fastProgram${EXE}'
    fastProgram="${BIN}/fastProgram${EXE}"
    cp "${fastProgram}" "fast-bin/fastProgram${EXE}"
    cp "${fastProgram}" "fast-bin/fast Program${EXE}"
fi

if [ ! -f auth.conf ]; then
    echo '   [Create] auth.conf'
    echo '#\n#   auth.conf - Authorization roles and users\n#\n\n' > auth.conf
    authpass --file auth.conf --cipher md5 --password pass4 example.com julie user
    authpass --file auth.conf --cipher md5 --password pass3 example.com peter user
    authpass --file auth.conf --cipher md5 --password pass2 example.com mary user executive
    authpass --file auth.conf --cipher md5 --password pass1 example.com joshua user administrator purchase
    authpass --file auth.conf --cipher blowfish --password pass5 example.com ralph user administrator purchase
fi
