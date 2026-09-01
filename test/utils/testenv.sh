#
#   testenv.sh - Shared shell helpers for the .tst.sh tests
#
#   Sourced, never executed.
#
#   On Windows the shell tests run under MSYS but appweb is a native Windows program, so the two
#   disagree about what a path is. MSYS says /c/ws/appweb/test; appweb cannot resolve that at all. A
#   test that writes /c/... into a configuration gets a server that will not start, and reports it as
#   a product failure. Everything a test hands to appweb -- a config value, a shebang -- must be
#   converted; everything the shell itself opens stays as it is.
#
#   These are functions rather than a block copied into each test so that the rule lives in one place.
#

#
#   The appweb executable under the given build directory, with the platform's extension.
#
tmAppweb() {
    if [ "${TESTME_OS:-}" = "windows" ] ; then
        echo "$1/appweb.exe"
    else
        echo "$1/appweb"
    fi
}

#
#   Convert a path this shell uses into one a native program can resolve. A no-op off Windows.
#
tmNative() {
    if [ "${TESTME_OS:-}" = "windows" ] ; then
        cygpath -m "$1"
    else
        echo "$1"
    fi
}

#
#   Stop a server this shell started in the background and wait for it to go.
#
#   SIGTERM is not delivered to a native Windows process under MSYS, so a test that sends only that
#   leaves the server holding its port and the harness waiting on its pipe until the timeout. Ask
#   politely, then escalate.
#
tmStopServer() {
    local pid="$1"
    local i

    kill -TERM "${pid}" 2>/dev/null
    for i in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "${pid}" 2>/dev/null || return 0
        sleep 0.5
    done
    kill -9 "${pid}" 2>/dev/null
    return 0
}
