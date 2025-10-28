#!/bin/bash
#
#   Test cleanup script
#

killall -q fastProgram
killall -q proxyServer

rm -f *.log
rm -f .test-prepared
rm -rf cache
rm -f app/cache/*
rm -f esp/*/cache/*
rm -rf junk
rm -f cgi-bin/* fast-bin/*

exit 0
