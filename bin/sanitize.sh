#!/bin/bash
#   sanitize.sh - Run the suite with ASan, UBSan, MPR heap checks and fatal assertions.
#   ASan cannot detect overruns between MPR-managed blocks; ME_MPR_ALLOC_CHECK checks their headers. It also cannot
#   see an overread into an MPR block's rounding slack or an MprBuf's spare capacity. LeakSanitizer is off because
#   the garbage collector holds memory at exit, and MemorySanitizer is not used for the product build.
#   Assertions are compiled in with ME_MPR_DEBUG_LOGGING rather than ME_DEBUG, which would change the lock and
#   debug paths so the code under test would no longer be the release code. ME_MPR_ASSERT_FATAL makes a failed
#   assertion abort, which ASan reports.
#   Instrumented objects are removed after the run.
#   Usage: bin/sanitize.sh [tm arguments]
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORTS="${ROOT}/test/tmp/sanitizer"

SANITIZE="-fsanitize=address,undefined,float-cast-overflow -fno-omit-frame-pointer -fsanitize-address-use-after-scope"

echo "      [Build] ASan and UBSan"
make -C "${ROOT}" clean >/dev/null 2>&1
if ! make -C "${ROOT}" build OPTIMIZE=test CFLAGS="${SANITIZE} -O1 -g -include ${ROOT}/bin/sanitize.h" LDFLAGS="${SANITIZE}" ; then
    echo "sanitize.sh: instrumented build failed"
    make -C "${ROOT}" clean >/dev/null 2>&1
    exit 1
fi

rm -fr "${REPORTS}"
mkdir -p "${REPORTS}"

# Retain reports and binaries. Disable leak detection for the GC heap; stop UBSan at its first report.
# Use raw frames and frame pointers to avoid teardown stalls.
SYMBOLIZE="${SANITIZE_SYMBOLIZE:-1}"
export ASAN_OPTIONS="detect_leaks=0:detect_stack_use_after_return=1:strict_string_checks=1:halt_on_error=1:handle_abort=1:fast_unwind_on_fatal=1:log_exe_name=1:symbolize=${SYMBOLIZE}:log_path=${REPORTS}/asan"
export UBSAN_OPTIONS="halt_on_error=1:print_stacktrace=1:log_exe_name=1:symbolize=${SYMBOLIZE}:log_path=${REPORTS}/ubsan"

#   Preload ASan on Linux: uninstrumented C tests otherwise load libc before the instrumented library and its
#   runtime. Only the suite runs with it, so the tools this script runs after it do not write reports.
PRELOAD=""
if [ "$(uname -s)" = "Linux" ]; then
    PRELOAD="$(${CC:-gcc} -print-file-name=libasan.so)"
fi

echo "       [Run] suite"
#   The sanitize profile compiles the C tests with bin/sanitize.h too (test/utils/profile.h). TestMe's rebuild check
#   does not see the profile, so rebuild them here and remove them after.
(cd "${ROOT}/test" && LD_PRELOAD="${PRELOAD}" PROFILE=sanitize tm --rebuild "$@")
status=$?

reports=$(find "${REPORTS}" -type f 2>/dev/null)
if [ -n "${reports}" ]; then
    echo "sanitize.sh: sanitizer reports:"
    for f in ${reports}; do
        echo "===== ${f}"
        cat "${f}"
    done
    cp -R "${ROOT}/build/bin" "${REPORTS}/bin"
    echo "sanitize.sh: the instrumented binaries the reports refer to are in ${REPORTS}/bin"
    status=1
fi

make -C "${ROOT}" clean >/dev/null 2>&1
(cd "${ROOT}/test" && tm --clean >/dev/null 2>&1)

if [ "${status}" -eq 0 ]; then
    echo "sanitize.sh: suite passed with no sanitizer reports"
fi
exit ${status}
