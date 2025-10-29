#!/usr/bin/env bash
#
#   skip.sh - Skip test if CGI is not available
#

if [ ! -f ${BIN}/cgiProgram${EXE} ]; then
    echo "CGI is not available"
    exit 1
fi
exit 0