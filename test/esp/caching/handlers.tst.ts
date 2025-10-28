/*
    handlers.tst.ts - ESP cache handler types test
    Verifies that ESP caching works correctly with different handler types
 */

import {thas, ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

async function testCache(uri) {
    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    ttrue(resp.number == first)
    http.close()
}

if (thas('ME_ESP')) {
    await testCache("/combined/cache.esp")
}
