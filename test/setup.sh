#!/bin/bash
#
#   setup.sh - TestMe setup script to start web
#

set -m

#
#   Services run with the cwd of the config group that invokes them. Always run from the
#   test directory so appweb reads test/appweb.conf.
#
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

#
#   Always launch the appweb we just built. Resolving via PATH can silently pick up an
#   installed appweb and test the wrong binary. BIN is exported by the top-level Makefile
#   and is not set when running "tm" directly.
#
BIN="${BIN:-$(cd ../build/bin 2>/dev/null && pwd)}"
APPWEB_CONFIG="${TM_APPWEB_CONFIG:-appweb.conf}"

EXE=""
if [ "$TESTME_OS" = "windows" ] ; then
    EXE=".exe"
fi

#
#   One-time bootstrap, before the server starts.
#
#   prep.sh runs before every configuration group and is where this used to happen. On a cold tree
#   its first invocation installs the test dependencies and generates the sample files, which takes
#   long enough that it was still running while the server was up and the first groups were
#   executing. The FastCGI tests were the ones that noticed: acquiring a launched app has a bounded
#   wait, and a machine busy fetching packages exceeded it, so a fresh unpack failed the whole fast
#   group on its first "make test" and passed on every run after.
#
#   Doing it here means the server starts on a quiet machine. prep.sh still runs per group, because
#   cleanup.sh empties cgi-bin and fast-bin between them and they must be repopulated.
#
./prep.sh

if curl -s http://localhost:4100/ >/dev/null 2>&1; then
    echo "Appweb is already running on port 4100"
    sleep 3600 &
else
    echo "Starting Appweb"
    #
    #   One launch for every platform. Windows had its own, and it could never have worked:
    #   windows.bat takes the command as its first argument, so "windows.bat x64 appweb ..." ran a
    #   command named x64, appweb was named without a path so it would have come from PATH rather
    #   than the build, and it was not backgrounded, so the $! below belonged to nothing. The setup
    #   service returned instead of holding the server open and the run died on the health check
    #   with "Setup process exited with code 0". It went unnoticed because the Windows build failed
    #   earlier, so the suite never reached this line.
    #
    #   The batch file exists to put the Visual Studio and OpenSSL environment in place for a
    #   build. Running an already-built appweb.exe needs neither: the DLLs it loads sit beside it
    #   in build/bin, which is where CI's openssl-prep.bat puts the OpenSSL ones.
    #
    "${BIN}/appweb${EXE}" --config "${APPWEB_CONFIG}" --trace appweb.log:4 &
fi

PID=$!
echo ${PID} > .pidfile

#
#   SIGTERM first so appweb shuts down in an orderly way. Its shutdown releases the backend apps
#   that the proxy and fast handlers launch, which kills them. SIGKILL cannot be caught, so it
#   skips that and leaves those apps running and still holding their listening ports. A leftover
#   proxy backend keeps port 9999 bound, and because the endpoint is declared "multiple"
#   (SO_REUSEPORT) a later appweb binds alongside it rather than failing, so connections are then
#   split between a live backend and an orphan.
#
#   Escalate to SIGKILL only if appweb is still up after the grace period.
#
cleanup() {
    kill -TERM $PID 2>/dev/null
    for i in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 $PID 2>/dev/null || exit 0
        sleep 0.5
    done
    kill -9 $PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM SIGQUIT EXIT

wait $PID
status=$?

#
#   Only reached when the server exits on its own -- being asked to stop runs cleanup(), which exits
#   from the trap. So this is a server that would not start or that died, and the run is over.
#
#   Say why. The EXIT trap used to swallow the status, so a server that failed to start was reported
#   by the runner as "Setup process exited with code 0 during health check" and nothing else, while
#   the reason sat in a log that cleanup.sh deletes moments later. The report is copied under tmp/,
#   which cleanup.sh does not touch, so CI can print it after the fact.
#
trap - EXIT
mkdir -p tmp
{
    echo "Appweb exited on its own with status ${status}"
    for log in appweb.log error.log ; do
        if [ -s "${log}" ] ; then
            echo "----- ${log}"
            cat "${log}"
        fi
    done
} 2>&1 | tee tmp/setup-failure.txt
exit ${status}
