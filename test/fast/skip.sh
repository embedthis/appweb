#!/usr/bin/env bash
#
#   skip.sh - Skip test if FastCGI is not available
#

if [ ! -f ${BIN}/fastProgram${EXE} ]; then
    echo "FastCGI is not available"
    exit 1
fi
exit 0