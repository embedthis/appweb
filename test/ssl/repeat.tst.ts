/*
    repeat.tst - TLS connection stability under repeated requests

    Exercises both connection reuse and a fresh handshake per request, which is where a TLS session
    or connection leak shows up. Rewritten off the Ejscript client, which has no TLS compiled in and
    so never ran this -- the previous revision reported PASS having asserted nothing. See issue
    10047.

    The two modes are many requests over one connection versus one request per connection. The counts
    are lower than the previous 110 and 50 because each handshake is a real one rather than a skipped
    test, and the group already runs alongside the rest of the suite.

    The reused half went through curl directly rather than through the helper, and kept a --cacert
    that no Windows curl honours -- every curl there is built against Schannel, which validates only
    against the Windows certificate store. It now goes through getMany, which does not verify at all:
    what this file asserts is that a connection survives reuse and that repeated handshakes do not
    leak, and ssl/cert.tst.ts is where verification is asserted.
 */

import {ttrue, tget} from '@embedthis/testme'
import {get, getMany, cert} from './tls'

const CA = cert('ca.crt')
const HTTPS = (tget('TM_HTTPS') || 'https://localhost:4443').replace('127.0.0.1', 'localhost')

/*
    Keep-alive: many requests over one reused connection. Every response must be 200, so the count of
    200s must equal the count requested.
 */
const REUSED = 40
ttrue(await getMany(HTTPS + '/index.html', REUSED) == REUSED)

//  Fresh connection and handshake per request
const FRESH = 10
let ok = 0
for (let i = 0; i < FRESH; i++) {
    if (await get(HTTPS + '/index.html', {ca: CA}) == '200') {
        ok++
    }
}
ttrue(ok == FRESH)
