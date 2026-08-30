/*
    repeat.tst - TLS connection stability under repeated requests

    Exercises both connection reuse and a fresh handshake per request, which is where a TLS session
    or connection leak shows up. Rewritten off the Ejscript client, which has no TLS compiled in and
    so never ran this -- the previous revision reported PASS having asserted nothing. See issue
    10047.

    curl reuses the connection within one invocation and starts a new one between invocations, so
    the two modes are a batched request list versus repeated single requests. The counts are lower
    than the previous 110 and 50 because each handshake is a real one rather than a skipped test,
    and the group already runs alongside the rest of the suite.
 */

import {ttrue, tget} from '@embedthis/testme'
import {get, cert} from './tls'
import {Cmd} from '@embedthis/ejscript'

const CA = cert('ca.crt')
const HTTPS = (tget('TM_HTTPS') || 'https://localhost:4443').replace('127.0.0.1', 'localhost')

/*
    Keep-alive: one curl invocation issuing many requests over a reused connection. Every response
    must be 200, so the count of 200s must equal the count requested.
 */
const REUSED = 40
let urls = ''
for (let i = 0; i < REUSED; i++) {
    urls += " '" + HTTPS + "/index.html'"
}
let out = await Cmd.sh("curl --silent --output /dev/null --write-out '%{http_code}\\n' " +
                       "--max-time 60 --cacert '" + CA + "'" + urls + " 2>/dev/null")
let codes = out.trim().split('\n').filter((s: string) => s.trim() == '200')
ttrue(codes.length == REUSED)

//  Fresh connection and handshake per request
const FRESH = 10
let ok = 0
for (let i = 0; i < FRESH; i++) {
    if (await get(HTTPS + '/index.html', {ca: CA}) == '200') {
        ok++
    }
}
ttrue(ok == FRESH)
