/*
    repeat.tst - TLS connection stability under repeated requests
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
