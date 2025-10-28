/*
    types.tst.ts - ESP cache MIME type matching test
    Verifies that ESP caching can match by MIME type of file extension
 */

import {thas, ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

async function cached(uri): Promise<Boolean> {
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
    ttrue(!await cached("/types/cache.esp"))
}
