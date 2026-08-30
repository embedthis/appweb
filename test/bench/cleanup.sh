#!/bin/bash
#
#   cleanup.sh - Cleanup Appweb benchmark test environment
#

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
