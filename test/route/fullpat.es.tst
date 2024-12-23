/*
    fullpat.tst - Test pattern matching features
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Test route-01  ^/route/(user|admin)/{action}/[^a-z]\{2}(\.[hH][tT][mM][lL])$>
http.get(HTTP + "/route/user/login/AA.html")
ttrue(http.status == 200)
ttrue(http.response == "user")

http.get(HTTP + "/route/user/login/aA.html")
ttrue(http.status == 404)
http.close()
