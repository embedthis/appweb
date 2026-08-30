#!/bin/bash
#
#   coverage.sh - Build Appweb instrumented, run the suite, and report line and branch coverage
#
#   No build in this repository could produce a coverage figure (10067). Every coverage statement
#   in doc/engineering/test-coverage-audit.md was inferred from reading source and grepping, and
#   gaps invisible to inspection were simply unknown. Under the CRA process this project follows,
#   test adequacy is a claim that has to be evidenced in the retained technical documentation, and
#   a figure produced by the build is the cheapest form of that evidence.
#
#   Additive by construction: instrumentation is passed through CFLAGS and LDFLAGS to the existing
#   generated makefiles, which already honour both. No configuration is added to premake5.lua and
#   no generated file changes, so the default build is untouched.
#
#   Usage:
#       bin/coverage.sh                 build, run the suite, report
#       bin/coverage.sh --no-build      report against an existing instrumented build
#       bin/coverage.sh --no-test       build and report without running the suite
#
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${ROOT}/build"
REPORT="${BUILD}/coverage"

DO_BUILD=1
DO_TEST=1
for arg in "$@"; do
    case "$arg" in
        --no-build) DO_BUILD=0 ;;
        --no-test)  DO_TEST=0 ;;
        *) echo "coverage.sh: unknown option $arg"; exit 2 ;;
    esac
done

#
#   gcov reader. Clang emits gcov-format data but the matching reader is llvm-cov, and a plain
#   "gcov" on a mac is often GCC's, which cannot read clang's format. Prefer the toolchain's own.
#
if xcrun --find llvm-cov >/dev/null 2>&1; then
    GCOV="$(xcrun --find llvm-cov) gcov"
elif command -v llvm-cov >/dev/null 2>&1; then
    GCOV="llvm-cov gcov"
elif command -v gcov >/dev/null 2>&1; then
    GCOV="gcov"
else
    echo "coverage.sh: no gcov or llvm-cov found"
    exit 1
fi

if [ "$DO_BUILD" -eq 1 ]; then
    echo "      [Build] instrumented"
    make -C "${ROOT}" clean >/dev/null 2>&1
    if ! make -C "${ROOT}" build \
            CFLAGS="--coverage -fprofile-arcs -ftest-coverage -O0 -g" \
            LDFLAGS="--coverage" ; then
        echo "coverage.sh: instrumented build failed"
        exit 1
    fi
fi

if [ "$DO_TEST" -eq 1 ]; then
    echo "       [Run] suite"
    #
    #   The suite's own result is not the gate here -- a failing test still produces coverage, and
    #   conflating "tests failed" with "coverage could not be measured" would hide the figure
    #   exactly when it is most wanted.
    #
    (cd "${ROOT}/test" && tm >/dev/null 2>&1)
    echo "       [Run] suite finished (status $?; not a gate for this report)"
fi

mkdir -p "${REPORT}"
cd "${REPORT}" || exit 1

count=$(find "${BUILD}/obj" -name '*.gcda' 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -eq 0 ]; then
    echo "coverage.sh: no .gcda data found under ${BUILD}/obj -- was the build instrumented and the suite run?"
    exit 1
fi
echo "      [Info] ${count} instrumented object(s) with data"

#   --branch-probabilities so branch coverage is reported, not only lines
find "${BUILD}/obj" -name '*.gcno' -print0 |
    xargs -0 ${GCOV} --branch-probabilities --preserve-paths >"${REPORT}/gcov.raw" 2>/dev/null

#
#   Summarise. gcov prints, per file, a "Lines executed:NN.NN% of N" line and, with
#   --branch-probabilities, a "Branches executed" and "Taken at least once" pair.
#
awk '
    /^File / {
        file = $2
        gsub(/['"'"'"]/, "", file)
        next
    }
    /^Lines executed:/ {
        split($0, a, ":")
        split(a[2], b, "% of ")
        lines[file] = b[1]
        total[file] = b[2]
        next
    }
    /^Taken at least once:/ {
        split($0, a, ":")
        split(a[2], b, "% of ")
        branch[file] = b[1]
        next
    }
    END {
        printf "\n%-46s %8s %9s %9s\n", "FILE", "LINES%", "BRANCH%", "LINES"
        printf "%-46s %8s %9s %9s\n", "----", "------", "-------", "-----"

        n = 0; coveredLines = 0; allLines = 0; coveredBranch = 0; branchLines = 0

        #   Sort by size, so the files that dominate the figure are read first
        for (f in lines) {
            if (f !~ /\/src\//) continue
            order[++n] = f
        }
        for (i = 1; i <= n; i++) {
            for (j = i + 1; j <= n; j++) {
                if (total[order[j]] + 0 > total[order[i]] + 0) {
                    tmp = order[i]; order[i] = order[j]; order[j] = tmp
                }
            }
        }

        for (i = 1; i <= n; i++) {
            f = order[i]
            short = f
            sub(/.*\/src\//, "src/", short)
            printf "%-46s %7.2f%% %8s %9d\n", short, lines[f],
                   (f in branch ? sprintf("%.2f%%", branch[f]) : "-"), total[f]

            #
            #   Weighted by instrumented line count. A mean of per-file percentages would let a
            #   17-line test handler count as much as the 16,000-line http amalgamation, which is
            #   the difference between a number that means something and one that flatters.
            #
            coveredLines += lines[f] * total[f]
            allLines     += total[f]
            if (f in branch) {
                coveredBranch += branch[f] * total[f]
                branchLines   += total[f]
            }
        }

        if (n == 0) {
            print "coverage.sh: no first-party source files in the gcov output"
            exit 1
        }
        branchPct = 0
        if (branchLines > 0) {
            branchPct = coveredBranch / branchLines
        }
        printf "%-46s %8s %9s %9s\n", "----", "------", "-------", "-----"
        printf "%-46s %7.2f%% %8.2f%% %9d\n",
               "OVERALL (" n " files, line-weighted)",
               coveredLines / allLines, branchPct, allLines
    }
' "${REPORT}/gcov.raw" | tee "${REPORT}/summary.txt"

echo ""
echo "      [Info] per-file gcov output in ${REPORT}"
echo "      [Info] summary in ${REPORT}/summary.txt"
