/*
    ext.tst - Test cache matching by extension.
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

/*
    Fetch twice and see if caching is working
 */
function cached(uri, expected): Boolean {
    http.get(HTTP + uri)
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    http.get(HTTP + uri)
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    if (expected != (resp.number == first)) {
        print("\nFirst number:  " + first)
        print("\nSecond number: " + resp.number)
        dump(http.response)
    }
    http.close()
    return (resp.number == first)
}

//  The esp request should be cached
if (thas('ME_ESP')) {
    ttrue(cached("/ext/cache.esp", true))
}
