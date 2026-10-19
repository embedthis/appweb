#!/bin/bash
#
#   exit-retry.tst.sh - A request queued on a FastCGI app that exits without answering it is sent to a new app
#
#   The app answers, then stays running a while before exiting (fastProgram -x -w), as php-cgi does when it shuts
#   down after its last request. The next request on the connection is queued on it meanwhile and never read. A
#   GET must be retried on a new app. A POST must not be sent twice: the app may have acted on it.
#

set -u

HTTP="${TM_HTTP:-127.0.0.1:4100}"
URL="${HTTP}/fast-retry/fastProgram?SWITCHES=-x%20-w%20300"

fail() { echo "FAIL: $*"; exit 1; }

if [ "$(uname -s)" = "Windows_NT" ] || [ -n "${WINDIR:-}" ]; then
    echo "SKIP: FastCGI is ME_UNIX_LIKE only"
    exit 0
fi

for round in 1 2 3; do
    codes=$(curl -s -m 30 -o /dev/null -o /dev/null -w '%{http_code} ' "${URL}" "${URL}")
    [ "${codes}" = "200 200 " ] || fail "round ${round}: GET queued on an exiting app answered ${codes}"
done

codes=$(curl -s -m 30 -o /dev/null -w '%{http_code} ' "${URL}" --next -o /dev/null -w '%{http_code} ' -d body "${URL}")
case "${codes}" in
    "200 200 ") fail "POST queued on an exiting app was sent again" ;;
    "200 "*) ;;
    *) fail "first request answered ${codes}" ;;
esac

echo "PASS: GET retried on a new app, POST not re-sent"
exit 0
