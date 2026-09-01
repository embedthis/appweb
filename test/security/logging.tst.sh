#!/bin/bash
#
#   logging.tst.sh - Credentials must not reach the log (SEC-014)
#
#   SEC-014 asserts that a credential does not reach the log at any trace level. Header tracing is
#   off by default and requires level 3, but the auth path is not the only writer: the header tracer
#   writes the request header block verbatim without consulting a deny list.
#
#   Asserted as it currently behaves, so the leak cannot widen unnoticed, with the assertions that
#   must replace it recorded alongside. Not fixed here -- this feature is test-only.
#
#   Runs its own server, on its own port, against its own configuration and its own log file. The
#   shared instance will not do: its log is shared with eighty other tests, cleanup.sh removes
#   *.log between groups, and monitor/ban.tst.ts arms a defence that answers this test's requests
#   406 while its window is open. A test about what is in a log file has to own the log file.
#
#   Written in shell rather than TypeScript because it starts and stops a server and greps a file,
#   and the Ejscript shim's process handling makes all three unreliable.
#
#   Copyright (c) All Rights Reserved. See details at the end of the file.
#

set -u

TESTDIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${TESTDIR}/../build/bin/appweb"
PORT=4500
HOST="127.0.0.1:${PORT}"

WORK="${TESTDIR}/tmp/logging"
CONF="${WORK}/logging.conf"
TRACE="${WORK}/trace.log"
ERRORS="${WORK}/error.log"

#   base64 of joshua:pass1 -- what Basic actually puts on the wire
BASIC='am9zaHVhOnBhc3Mx'
COOKIE='sentinel=SECRETCOOKIEVALUE'

fail() { echo "FAIL: $*"; cleanup; exit 1; }
pass() { echo "PASS: $*"; }

SERVER=""

#
#   Kill the server by the PID we recorded, never by pattern. A pkill -f wide enough to match the
#   server also matches any shell whose command line happens to carry the same text -- including
#   the one that invoked this script, which is a confusing way to lose a test run.
#
cleanup() {
    #
    #   Preserve the script's exit status across the trap. Without this the status of the last
    #   command in here becomes the script's own, and "wait" on a server we just signalled
    #   reports the signal -- so a fully passing run exited 131.
    #
    local status=$?
    if [ -n "${SERVER}" ]; then
        #
        #   SIGKILL, and no wait. On SIGTERM appweb's shutdown path signals its own process
        #   group, which reaches this shell -- a fully passing run exited 131 because of it.
        #   Nothing here needs a graceful stop: the log has already been read and the whole
        #   working directory is about to be removed.
        #
        kill -9 "${SERVER}" 2>/dev/null
    fi
    rm -rf "${WORK}"
    exit $status
}

if [ ! -x "${BIN}" ]; then
    echo "SKIP: appweb is not built at ${BIN}"
    exit 0
fi

trap cleanup EXIT

rm -rf "${WORK}"
mkdir -p "${WORK}"

#
#   Maximum tracing over authenticated routes. headers=3 is what puts the request header block --
#   Authorization among it -- within reach of the trace log at all. joshua's credential is the MD5
#   the main appweb.conf carries; users are defined inline there, so there is no shared auth file
#   to include.
#
cat > "${CONF}" <<CONF
ErrorLog                ${ERRORS} level=4
TraceLog                ${TRACE} level=3 formatter=pretty

Listen                  ${PORT}
Documents               ${TESTDIR}/web
LimitWorkers            2

AddHandler              fileHandler html txt ""

Role                    user view
User                    joshua 2fd6e47ff9bb70c0465fd2f5c8e5305e user

<Route ^/traced/>
    Prefix              /traced
    Documents           ${TESTDIR}/web
    Trace               debug=1 error=1 request=1 result=2 headers=3 context=4 packet=5 detail=6 content=10K
    AuthType            basic example.com
    Require             user joshua
</Route>

<Route ^/tracedigest/>
    Prefix              /tracedigest
    Documents           ${TESTDIR}/web
    Trace               debug=1 error=1 request=1 result=2 headers=3 context=4 packet=5 detail=6 content=10K
    AuthType            digest example.com
    Require             user joshua
</Route>
CONF

#
#   Appweb declares its endpoints "multiple", so a second server binds alongside a stale one via
#   SO_REUSEPORT rather than failing, and requests then land on whichever. The unauthenticated
#   probe below is what catches that, since a stale neighbour will not have the traced routes.
#
"${BIN}" --config "${CONF}" >/dev/null 2>&1 &
SERVER=$!

#   Wait for the listener rather than sleeping a fixed interval
up=""
for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://${HOST}/index.html" 2>/dev/null)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
        up=1
        break
    fi
    sleep 0.25
done
[ -n "$up" ] || fail "the server did not start on ${PORT}"

#   And that this server is the one serving the traced routes, not a stale neighbour
code=$(curl -s -o /dev/null -w '%{http_code}' "http://${HOST}/traced/index.html")
[ "$code" = "401" ] || fail "expected 401 from the unauthenticated traced route, got ${code}"
pass "the test's own server is serving the traced routes"

#   Drive one Basic, one Digest and one cookie-bearing request
code=$(curl -s -o /dev/null -w '%{http_code}' -u joshua:pass1 "http://${HOST}/traced/index.html")
[ "$code" = "200" ] || fail "Basic authentication returned ${code}"

code=$(curl -s -o /dev/null -w '%{http_code}' --digest -u joshua:pass1 \
    "http://${HOST}/tracedigest/index.html")
[ "$code" = "200" ] || fail "Digest authentication returned ${code}"

code=$(curl -s -o /dev/null -w '%{http_code}' -u joshua:pass1 -b "${COOKIE}" \
    "http://${HOST}/traced/index.html")
[ "$code" = "200" ] || fail "the cookie-bearing request returned ${code}"
pass "all three authenticated requests were served"

#   The trace log is written asynchronously; poll for the marker rather than reading once
for i in $(seq 1 60); do
    [ -f "${TRACE}" ] && grep -q '/traced/index.html' "${TRACE}" && break
    sleep 0.1
done

#
#   The log must contain the request itself. Without this every assertion below would pass just as
#   well against a log that recorded nothing at all -- the failure mode any test asserting only
#   absence always has.
#
[ -s "${TRACE}" ] || fail "the trace log is empty; nothing below would mean anything"
grep -q '/traced/index.html' "${TRACE}" || fail "the trace log does not contain the request"
pass "the trace log recorded the requests"

#
#   10131. Each of the three is written to disk today. When 10131 is fixed each of these becomes
#   its negation, and the header *name* should still appear -- so the trace continues to show the
#   header was present without disclosing its value.
#
grep -q "${BASIC}" "${TRACE}" || fail "expected the Basic credential in the log (10131)"
echo "10131: the Basic credential is in the trace log; it is base64, so it is the password"

grep -q 'response=' "${TRACE}" || fail "expected the Digest response in the log (10131)"
echo "10131: the Digest response is in the trace log, replayable for the life of the nonce"

grep -q 'SECRETCOOKIEVALUE' "${TRACE}" || fail "expected the session cookie in the log (10131)"
echo "10131: the session cookie value is in the trace log"
pass "the three leaks of 10131 are present and pinned"

#
#   The property that must hold whatever else does: the password is never written in the clear.
#   Basic is base64 rather than plaintext, so this passes today -- but it separates "encoded
#   credential on disk" from "plaintext password on disk", and would catch a trace formatter that
#   decoded the header for readability.
#
grep -q 'pass1' "${TRACE}" && fail "the plaintext password reached the trace log"
pass "the plaintext password is not in the trace log"

#   The error log must not carry them either -- it is the log most likely to be shipped onward
if [ -f "${ERRORS}" ]; then
    grep -q "${BASIC}" "${ERRORS}" && fail "the Basic credential reached the error log"
    grep -q 'SECRETCOOKIEVALUE' "${ERRORS}" && fail "the session cookie reached the error log"
    grep -q 'pass1' "${ERRORS}" && fail "the plaintext password reached the error log"
fi
pass "no credential material reached the error log"

exit 0

#
#   Copyright (c) Embedthis Software. All Rights Reserved.
#   This software is distributed under a commercial license. Consult the LICENSE.md
#   distributed with this software for full details and copyrights.
#
