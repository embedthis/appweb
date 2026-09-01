/*
    gateways.ts - Which gateway handlers a build on this platform actually has

    Neither FastCGI nor the reverse proxy exists in a Windows build:

      fastHandler.c   opens with "#if ME_COM_FAST && ME_UNIX_LIKE", so it compiles to nothing, and
                      projects/premake5.lua does not emit the fastProgram fixture there either --
                      libfcgi is not among a Windows build's dependencies
      proxyHandler    is compiled in, but PROXY_MODULE is only defined on Unix-like systems in
                      src/config.c, so the <if PROXY_MODULE> block in test/appweb.conf never runs
                      and the route is not configured

    A request to either route on Windows therefore falls through to the file handler and returns 404.
    That is a missing handler, not a failing one, and reading it as a failure is how these arms came
    to break the Windows suite the day it was first enabled.

    test/fast/skip.sh and test/proxy/skip.sh skip those groups wholesale for the same reason. A test
    that spans handlers cannot: skipping the file would take fileHandler, cgiHandler and
    actionHandler with it, and those work on Windows. So it skips the arms with no handler behind
    them and runs the rest.
 */

export const WINDOWS = process.platform === 'win32'

export const HAS_FAST = !WINDOWS
export const HAS_PROXY = !WINDOWS

export const NO_FAST = 'FastCGI is not available on this platform (fastHandler is ME_UNIX_LIKE)'
export const NO_PROXY = 'the reverse proxy is not available on this platform (PROXY_MODULE is Unix-only)'
