/*
    only.tst.ts - ESP cache "only" mode test
    Verifies that only mode caches exact URIs without query parameters
 */

import {ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/unique/cache.esp")
await http.finalize()
ttrue(http.status == 200)
let resp = deserialize(http.response)
let first = resp.number
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "null")

http.get(HTTP + "/unique/cache.esp")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number == first)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "null")

http.get(HTTP + "/unique/cache.esp?a=b&c=d")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
let firstQuery = resp.number
ttrue(resp.number != first)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "a=b&c=d")

http.get(HTTP + "/unique/cache.esp?w=x&y=z")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number != first)
ttrue(resp.number != firstQuery)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "w=x&y=z")

http.close()
