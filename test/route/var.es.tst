/*
    var.tst - Test Update var
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.setHeader("From", "Mars")
http.get(HTTP + "/route/update/var")

ttrue(http.status == 200)
ttrue(http.response == "Mars")
http.close()
