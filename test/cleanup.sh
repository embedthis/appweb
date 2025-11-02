#!/bin/bash
#
#   Test cleanup script
#

echo IN CLEANUP
env | grep TESTME

if [ "${TESTME_SUCCESS}" = "1" ]; then
    rm -f appweb.log
else
    echo "Appweb log:"
    echo "--------------------------------"
    cat appweb.log
    echo "--------------------------------"
fi

if [ "$TESTME_OS" != "windows" ] ; then
    killall -q fastProgram
    killall -q proxyServer
fi

rm -f *.log
rm -f .test-prepared
rm -rf cache
rm -f app/cache/*
rm -f esp/*/cache/*
rm -rf junk
rm -f cgi-bin/* fast-bin/*

exit 0
