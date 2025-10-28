/*
    query.tst - Http query tests

    Tests HTTP query string parameter parsing with various formats including
    parameters without values and parameters with values.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_EJS')) {
    // Test query parameters without values
    http.get(HTTP + "/form.ejs?a&b&c")
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('"a": ""'))
    ttrue(http.response.contains('"b": ""'))
    ttrue(http.response.contains('"c": ""'))

    // Test query parameters with values
    http.get(HTTP + "/form.ejs?a=x&b=y&c=z")
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('"a": "x"'))
    ttrue(http.response.contains('"b": "y"'))
    ttrue(http.response.contains('"c": "z"'))
    http.close()

} else {
    tskip("ejs not enabled")
}
