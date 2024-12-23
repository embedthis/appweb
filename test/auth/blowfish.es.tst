/*
    blowfish.tst - Blowfish cipher authentication tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

http.setCredentials("ralph", "pass5")
http.get(HTTP + "/auth/blowfish/ralph.html")
ttrue(http.status == 200)
ttrue(http.response.contains('Welcome to Blowfish Basic - Access for ralph'))
http.close()
