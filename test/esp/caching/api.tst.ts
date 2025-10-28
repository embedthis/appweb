/*
    api.tst.ts - ESP cache API configuration test
    Verifies that ESP caching can be configured programmatically via API
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_ESP')) {
    http.get(HTTP + "/cache/clear")
    await http.finalize()
    ttrue(http.status == 200)

    http.get(HTTP + "/cache/api")
    await http.finalize()
    ttrue(http.status == 200)

    http.get(HTTP + "/cache/api")
    await http.finalize()
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number
    ttrue(resp.uri == "/cache/api")
    ttrue(resp.query == "null")

    http.get(HTTP + "/cache/api")
    await http.finalize()
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    ttrue(resp.number == first)
    ttrue(resp.uri == "/cache/api")
    ttrue(resp.query == "null")

    http.close()

} else {
    tskip("ESP not enabled")
}
