#!/usr/bin/env bash
#
#   setup.sh - Start Appweb server for benchmark testing
#
#   Anchor on this script's own directory: appweb.conf, bench.log and bench.pid below are all
#   relative, so running from anywhere else starts the wrong configuration or writes the pid file
#   where nothing will remove it.
#
cd "$(dirname "$0")" || exit 1

set -m

# Hard-coded endpoints matching appweb.conf
HTTP_ENDPOINT="http://localhost:4200"
HTTPS_ENDPOINT="https://localhost:4201"

#
#   The server under test is the one this tree builds.
#
#   This used to run bare "appweb", taking whatever PATH resolved to. On the release machine that was
#   /usr/local/bin/appweb -- an installed 9.0.2 from 2024 -- so the benchmark measured a two-year-old
#   binary and reported the numbers as this tree's. It was only noticed because 9.0.2 does not carry
#   the action the harness requests and answered 404. Every figure this harness has ever produced
#   should be read as describing whatever happened to be installed.
#
APPWEB=../../build/bin/appweb
if [ ! -x "$APPWEB" ]; then
    echo "Cannot find $APPWEB -- build the tree before running the benchmarks" >&2
    exit 1
fi

#
#   Refuse to adopt a server this script did not start.
#
#   The previous version treated anything answering on 4200 as its own, recorded that process's pid
#   and benchmarked it. A server left by an interrupted run, or one built from a different tree, was
#   silently measured instead -- the same trap documented for the main suite in test/setup.sh, and the
#   one that made three separate release measurements unusable on 2026-09-01.
#
if curl -s -k ${HTTP_ENDPOINT}/ >/dev/null 2>&1; then
    echo "Something is already listening on ${HTTP_ENDPOINT}." >&2
    echo "Benchmarks must measure the server this script starts. Stop it and re-run:" >&2
    echo "    killall -9 appweb" >&2
    exit 1
fi

echo "Starting Appweb server for benchmarks on ${HTTP_ENDPOINT} and ${HTTPS_ENDPOINT}"
$APPWEB --config appweb.conf --log bench.log:4 &
WAITING_PID=$!
echo $WAITING_PID > bench.pid

cleanup() {
    kill $WAITING_PID 2>/dev/null
    rm -f bench.pid
    exit 0
}

trap cleanup SIGINT SIGTERM SIGQUIT EXIT

wait $WAITING_PID
