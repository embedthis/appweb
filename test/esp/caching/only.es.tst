/*
    only.tst - Test caching in "only" mode. This caches only the exact URIs specified.
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  1. Test that content is being cached
//  Initial get
http.get(HTTP + "/unique/cache.esp")
ttrue(http.status == 200)
let resp = deserialize(http.response)
let first = resp.number
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "null")

//  Second get, should get the same content (number must not change)
http.get(HTTP + "/unique/cache.esp")
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number == first)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "null")


//  2. Test that a URI with query will not be cached.
//  Third get, should get different content as URI will be different
http.get(HTTP + "/unique/cache.esp?a=b&c=d")
ttrue(http.status == 200)
resp = deserialize(http.response)
let firstQuery = resp.number
ttrue(resp.number != first)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "a=b&c=d")

http.get(HTTP + "/unique/cache.esp?w=x&y=z")
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number != first)
ttrue(resp.number != firstQuery)
ttrue(resp.uri == "/unique/cache.esp")
ttrue(resp.query == "w=x&y=z")

http.close()
