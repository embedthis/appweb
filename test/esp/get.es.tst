/*
    get.tst - ESP GET tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Basic get. Validate response code and contents
http.get(HTTP + "/test.esp")
ttrue(http.status == 200)
ttrue(http.response.contains("ESP Test Program"))

/* When running in test, the name may be appweb or forAppwebTest */
ttrue(http.response.contains("Product Name"))
http.close()

if (Config.OS == 'windows') {
    http.get(HTTP + "/teST.eSP")
    ttrue(http.status == 200)
    http.close()
}
