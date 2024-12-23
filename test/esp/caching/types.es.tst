/*
    types.tst - Test cache matching by mime type of the file extension
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

/*
    Fetch twice and see if caching is working
 */
function cached(uri): Boolean {
    http.get(HTTP + uri)
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number

    http.get(HTTP + uri)
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    http.close()
    return (resp.number == first)
}

if (thas('ME_ESP')) {
    ttrue(!cached("/types/cache.esp"))
}
