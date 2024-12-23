/*
    query.tst - Http query tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_EJS')) {
    http.get(HTTP + "/form.ejs?a&b&c")
    ttrue(http.status == 200)
    ttrue(http.response.contains('"a": ""'))
    ttrue(http.response.contains('"b": ""'))
    ttrue(http.response.contains('"c": ""'))

    http.get(HTTP + "/form.ejs?a=x&b=y&c=z")
    ttrue(http.status == 200)
    ttrue(http.response.contains('"a": "x"'))
    ttrue(http.response.contains('"b": "y"'))
    ttrue(http.response.contains('"c": "z"'))
    http.close()

} else {
    tskip("ejs not enabled")
}
