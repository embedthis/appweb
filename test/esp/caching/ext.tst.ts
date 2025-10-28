/*
    ext.tst.ts - ESP cache extension matching test
    Verifies that ESP caching works correctly with file extension matching
 */

import {thas, ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

async function cached(uri, expected): Promise<Boolean> {
    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    http.close()
    return (resp.number == first)
}

if (thas('ME_ESP')) {
    ttrue(await cached("/ext/cache.esp", true))
}
