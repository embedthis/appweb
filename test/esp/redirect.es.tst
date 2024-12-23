/*
    redirect.tst - ESP redirection tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  This will not follow redirects
http.get(HTTP + "/redirect.esp")
http.followRedirects = false
ttrue(http.status == 302)
ttrue(http.response.contains("<h1>Moved Temporarily</h1>"))
http.close()

//  This will do a transparent redirect to index.esp
http.followRedirects = true
http.get(HTTP + "/redirect.esp")
ttrue(http.status == 200)
ttrue(http.response.contains("Greetings: Hello Home Page"))
http.close()
