#!/usr/bin/env bash
#
#   skip.sh - Skip test if CGI is not available
#
#   BIN is exported by the top-level Makefile. It is not set when running "tm" directly,
#   so fall back to the build directory relative to this script.
#

BIN="${BIN:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../build/bin" 2>/dev/null && pwd)}"

if [ ! -f "${BIN}/cgiProgram${EXE}" ]; then
    echo "CGI is not available"
    exit 1
fi
exit 0
