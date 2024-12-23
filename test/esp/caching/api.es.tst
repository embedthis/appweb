/*
    api.tst - Test configuration of caching by API
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_ESP')) {
    //  Prep and clear the cache
    http.get(HTTP + "/cache/clear")
    ttrue(http.status == 200)

    //  This will load the controller and configure caching for "api"
    http.get(HTTP + "/cache/api")
    ttrue(http.status == 200)

    //  This request should now be cached
    http.get(HTTP + "/cache/api")
    ttrue(http.status == 200)
    let resp = deserialize(http.response)
    let first = resp.number
    ttrue(resp.uri == "/cache/api")
    ttrue(resp.query == "null")

    http.get(HTTP + "/cache/api")
    ttrue(http.status == 200)
    resp = deserialize(http.response)
    ttrue(resp.number == first)
    ttrue(resp.uri == "/cache/api")
    ttrue(resp.query == "null")

    http.close()

} else {
    tskip("ESP not enabled")
}
