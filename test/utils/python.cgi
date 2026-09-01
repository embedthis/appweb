#!/bin/bash
#
#   python.cgi - Invoke Python as a CGI interpreter, for the Action directive test
#
#   Resolved from PATH rather than hardcoded, for the same reason as php.cgi. The Action directive
#   this replaces named /usr/bin/python, which has existed on no platform the suite runs on since
#   macOS dropped Python 2 -- and while the Action directive itself was inert, nothing noticed.
#
#   The test probes for python3 itself and skips with a reason when it is absent, so this script
#   failing to find one is reported by the test rather than by a mystery 404.
#
exec python3 "$@"
