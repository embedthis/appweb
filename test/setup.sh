#!/bin/bash
#
#   setup.sh - TestMe setup script to start web
#

set -m

if curl -s http://localhost:4100/ >/dev/null 2>&1; then
    echo "Appweb is already running on port 4100"
    sleep 999999 &
else
    echo "Starting Appweb"
    if [ "$TESTME_OS" = "windows" ] ; then
        ../projects/windows.bat x64 appweb --trace appweb.log:4
    else
        appweb --trace appweb.log:4 &
    fi
fi

PID=$!

cleanup() {
    kill -9 $PID
    exit 0
}

trap cleanup SIGINT SIGTERM SIGQUIT EXIT

wait $PID
