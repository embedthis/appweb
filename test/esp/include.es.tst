/*
    include.tst - ESP include directives
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Basic get. Validate response code and contents
http.get(HTTP + "/outer.esp")
ttrue(http.status == 200)
ttrue(http.response.contains("Hello from inner text"))
http.close()
