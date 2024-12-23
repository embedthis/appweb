/*
    methods.tst - Test cache matching by method

    WARNING: this unit test can fail if your local time is not set correctly.
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

/*
    Fetch twice and test if caching is working
 */
function cached(method, uri): Boolean {
    let http: Http = new Http

    //  Clear cache
    http.setHeader("Cache-Control", "no-cache")
    // print('CLEAR', method, HTTP + uri)
    http.connect(method, HTTP + uri)
    http.wait()

    //  First fetch
    http.connect(method, HTTP + uri)
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number
    // print('FIRST', method, HTTP + uri, http.response)

    //  Second fetch
    http.connect(method, HTTP + uri)
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    // print('SECOND', method, HTTP + uri, http.response)
    http.close()
    return (resp.number == first)
}

if (thas('ME_ESP')) {
    //  The POST requst should be cached and the GET not
    ttrue(cached("POST", "/methods/cache.esp"))
    ttrue(!cached("GET", "/methods/cache.esp"))
}

