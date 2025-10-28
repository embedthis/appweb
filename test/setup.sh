#!/bin/bash
#
#   setup.sh - TestMe setup script to start web
#

set -m

if curl -s http://localhost:4100/ >/dev/null 2>&1; then
    echo "Appweb is already running on port 4100"
    sleep 999999 &
else
    appweb --trace log.txt:4 &
fi

PID=$!

cleanup() {
    if [ "${TESTME_VERBOSE}" = "1" ] ; then
        cat log.txt >&2
    fi
    kill -9 $PID
    exit 0
}

trap cleanup SIGINT SIGTERM SIGQUIT EXIT

wait $PID
