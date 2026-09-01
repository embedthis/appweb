#!/bin/bash
#
#   cleanup.sh - Cleanup Appweb benchmark test environment
#
#   Anchor on this script's own directory. The paths below are relative, and a service run from
#   anywhere else removed nothing: bench.pid survived every run and landed in the working tree as an
#   untracked file, which then tripped release-check's "no untracked test files" gate for a reason
#   that had nothing to do with the release.
#
cd "$(dirname "$0")" || exit 1

# Kill any appweb servers on benchmark ports (4200, 4201)
# lsof -ti:4200 2>/dev/null | xargs kill -9 2>/dev/null || true
# lsof -ti:4201 2>/dev/null | xargs kill -9 2>/dev/null || true

# Clean up pid file
rm -f bench.pid

# Clean up put benchmark directory
rm -rf site/put/* 2>/dev/null || true

# Note: Keep bench.log for debugging if tests fail
# TestMe will handle log preservation based on test results

echo "Benchmark environment cleaned up"
