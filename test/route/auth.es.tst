/*
    auth.tst - Test authorized condition
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/route/auth/basic.html")
ttrue(http.status == 401)
http.close()
