/*
    httpoxy.tst.ts - CGI environment must not be settable from request headers (APPWEB-SA-2026-0002)

    Every request header is exposed to a CGI child as HTTP_<NAME>. A "Proxy:" header therefore sets
    HTTP_PROXY, which many HTTP client libraries read as their outbound proxy -- CVE-2016-5385 and
    the rest of the httpoxy family. "Authorization:" sets HTTP_AUTHORIZATION, handing the child the
    caller's credentials. Both must be dropped; ordinary headers must still come through.

    Note the reachable set here is the HTTP_ prefixed names only: a header cannot produce a bare
    LD_PRELOAD or PYTHONPATH, because the HTTP_ prefix is always applied. Those names are on the
    deny list for the un-prefixed copy paths (form and query parameters on a route whose EnvPrefix
    is empty), not for headers.
 */

import {ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

const response = await fetch(HTTP + '/cgiProgram.cgi', {
    headers: {
        'Proxy': 'http://attacker.example',
        'Authorization': 'Basic am9zaHVhOnBhc3Mx',
        'X-Custom': 'benign',
    },
})
ttrue(response.status == 200)
const body = await response.text()

//  The httpoxy vector itself
ttrue(!body.includes('HTTP_PROXY'))

//  Credentials must not be forwarded into the child environment
ttrue(!body.includes('HTTP_AUTHORIZATION'))

//  The filter must not swallow ordinary headers, nor truncate the variables that follow it
ttrue(body.includes('HTTP_X_CUSTOM=benign'))
ttrue(body.includes('REQUEST_METHOD=GET'))
ttrue(body.includes('SCRIPT_NAME=/cgiProgram.cgi'))
