/*
    methods.tst.ts - ESP cache HTTP method matching test
    Verifies that ESP caching can distinguish between different HTTP methods
 */

import {thas, ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

async function cached(method, uri): Promise<Boolean> {
    let http: Http = new Http

    http.setHeader("Cache-Control", "no-cache")
    http.connect(method, HTTP + uri)
    await http.finalize()

    http.connect(method, HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    http.connect(method, HTTP + uri)
    await http.finalize()
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    http.close()
    return (resp.number == first)
}

if (thas('ME_ESP')) {
    ttrue(await cached("POST", "/methods/cache.esp"))
    ttrue(!await cached("GET", "/methods/cache.esp"))
}

