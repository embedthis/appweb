#!/bin/bash
#
#   reap-recycle.tst.sh - A FastCGI app's death must not fail the next request on the same keep-alive connection
#
#   When an app exits, its SIGCHLD handler schedules a short-delayed reap event for each request still on the app.
#   If the request finishes and its stream begins the next keep-alive request before the event runs, the event must
#   recognise the request is gone and leave the stream alone. Otherwise the next request fails with a comms error
#   although its own app is healthy.
#
#   Each round asks an app to exit after answering (fastProgram -x) and immediately sends a second request on the
#   same connection. The next round starts at once, so its first request can also find the last app exited but not
#   yet reaped, idle with a pooled connection. The race is timing dependent, so the rounds repeat it.
#

set -u

HTTP="${TM_HTTP:-127.0.0.1:4100}"
URL="${HTTP}/fast-exit/fastProgram?SWITCHES=-x"

fail() { echo "FAIL: $*"; exit 1; }

if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: FastCGI is ME_UNIX_LIKE only"
    exit 0
fi

for round in $(seq 1 50); do
    codes=$(curl -s -m 30 -o /dev/null -o /dev/null -w '%{http_code} ' "${URL}" "${URL}")
    [ "${codes}" = "200 200 " ] || fail "round ${round}: keep-alive requests after an app exit answered ${codes}"
done

echo "PASS: 50 rounds of an exiting FastCGI app left the following keep-alive request untouched"
exit 0
