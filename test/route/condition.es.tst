/*
    condition.tst - Test conditions
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/route/cond")
ttrue(http.status == 200)
ttrue(http.response == "http")
http.close()
