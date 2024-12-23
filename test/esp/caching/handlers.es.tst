/*
    handlers.tst - Test caching with various handler types
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  1. Test that content is being cached
//  Initial get
function testCache(uri) {
    http.get(HTTP + uri)
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    //  Second get, should get the same content (number must not change)
    http.get(HTTP + uri)
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    ttrue(resp.number == first)
    http.close()
}

if (thas('ME_ESP')) {
    testCache("/combined/cache.esp")
}
