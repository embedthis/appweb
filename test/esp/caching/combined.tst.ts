/*
    combined.tst.ts - ESP combined cache mode test
    Verifies that combined caching ignores query parameters when caching URIs
 */

import {ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.setHeader("Cache-Control", "no-cache")
http.get(HTTP + "/combined/cache.esp")
await http.finalize()

http.get(HTTP + "/combined/cache.esp")
await http.finalize()
ttrue(http.status == 200)
let resp = deserialize(http.response)
let first = resp.number
ttrue(resp.uri == "/combined/cache.esp")
ttrue(resp.query == "null")

http.reset()
http.cache = false
http.get(HTTP + "/combined/cache.esp")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number == first)
ttrue(resp.uri == "/combined/cache.esp")
ttrue(resp.query == "null")

http.reset()
http.get(HTTP + "/combined/cache.esp?a=b&c=d")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
let firstQuery = resp.number
ttrue(resp.number == first)
ttrue(resp.uri == "/combined/cache.esp")
ttrue(resp.query == "null")

http.close()
