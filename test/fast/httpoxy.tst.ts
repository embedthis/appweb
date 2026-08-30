/*
    httpoxy.tst.ts - FastCGI params must not be settable from request headers (APPWEB-SA-2026-0002)

    FastCGI params become environment variables in the application, so the httpoxy vector that
    applies to CGI applies here too. FastCGI preserves the header's original spelling (HTTP_Proxy,
    not HTTP_PROXY), so the filter must match without regard to case or '-' versus '_'.
 */

import {ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

const response = await fetch(HTTP + '/fast-bin/fastProgram', {
    headers: {
        'Proxy': 'http://attacker.example',
        'Authorization': 'Basic am9zaHVhOnBhc3Mx',
        'X-Custom': 'benign',
    },
})
ttrue(response.status == 200)
const body = await response.text()

//  Matched despite the mixed-case name FastCGI passes through unaltered
ttrue(!/HTTP_Proxy/i.test(body))
ttrue(!/HTTP_Authorization/i.test(body))

//  Ordinary headers still reach the application
ttrue(/HTTP_X.Custom=benign/i.test(body))
ttrue(body.includes('REQUEST_METHOD=GET'))
