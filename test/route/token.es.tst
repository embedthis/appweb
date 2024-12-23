/*
    token.tst - Test tokenized parameters
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/route/tokens/login?fast")
ttrue(http.status == 200)
ttrue(http.response == "login-fast")
http.close()
