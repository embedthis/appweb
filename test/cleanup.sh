#!/bin/bash
#
#   Test cleanup script
#
#   Services run with the cwd of the config group that invokes them. Always operate
#   relative to the test directory so the cgi, fast and proxy groups behave identically.
#
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

if [ "${TESTME_SUCCESS}" = "1" ]; then
    rm -f appweb.log
else
    echo "Appweb log:"
    echo "--------------------------------"
    cat appweb.log
    echo "--------------------------------"
    #   Keep the server's logs from a failed run under tmp/, which is not cleaned, so CI can publish them
    mkdir -p tmp/server-logs
    stamp="$(date +%Y%m%d-%H%M%S)-$$"
    for log in appweb.log error.log trace.log ; do
        if [ -s "${log}" ] ; then
            cp "${log}" "tmp/server-logs/${stamp}-${log}"
        fi
    done
fi

if [ "$TESTME_OS" != "windows" ] ; then
    killall -q fastProgram
    killall -q proxyServer
fi

rm -f *.log
rm -f .test-prepared web/setup-ready.txt
rm -rf cache
rm -f app/cache/*
rm -rf junk
rm -f cgi-bin/* fast-bin/*

#
#   Sockets left behind in the test directory are never test fixtures. Git cannot track them,
#   so they are invisible to git status and accumulate silently.
#
if [ "$TESTME_OS" != "windows" ] ; then
    find . -maxdepth 1 -type s -delete
fi

exit 0
