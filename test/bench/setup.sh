#!/usr/bin/env bash
#
#   setup.sh - Start Appweb server for benchmark testing
#

set -m

# Hard-coded endpoints matching appweb.conf
HTTP_ENDPOINT="http://localhost:4200"
HTTPS_ENDPOINT="https://localhost:4201"
STARTED_SERVER=0

# Check if server is already running
if curl -s -k ${HTTP_ENDPOINT}/ >/dev/null 2>&1; then
    echo "Appweb is already running on ${HTTP_ENDPOINT}"

    # Find the running appweb process (cross-platform)
    if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
        PID=$(lsof -ti :4200 2>/dev/null | head -1)
    else
        # Windows Git Bash
        PID=$(netstat -ano 2>/dev/null | grep ':4200.*LISTEN' | awk '{print $NF}' | head -1)
    fi
    # Fallback: search for appweb process by name
    if [ -z "$PID" ]; then
        if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
            PID=$(pgrep -f "appweb.*bench" | head -1)
        fi
    fi
    # Another fallback: any appweb process
    if [ -z "$PID" ]; then
        if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
            PID=$(pgrep appweb | head -1)
        fi
    fi
    if [ -n "$PID" ]; then
        echo "Found existing appweb process: PID $PID"
        echo $PID > bench.pid
    else
        echo "Warning: Could not find appweb PID"
    fi
    sleep 999999 &
    WAITING_PID=$!
else
    echo "Starting Appweb server for benchmarks on ${HTTP_ENDPOINT} and ${HTTPS_ENDPOINT}"
    appweb --config appweb.conf --log bench.log:4 &
    WAITING_PID=$!
    echo $WAITING_PID > bench.pid
fi

cleanup() {
    kill $WAITING_PID 2>/dev/null
    rm -f bench.pid
    exit 0
}

trap cleanup SIGINT SIGTERM SIGQUIT EXIT

wait $WAITING_PID
