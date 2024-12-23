/*
    redirect.tst - Redirect directive
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http


//  Standard error messages
http.get(HTTP + "/old.html")
ttrue(http.status == 302)
ttrue(http.response.contains("<h1>Moved Temporarily</h1>"))
http.close()

http = new Http
http.followRedirects = true
http.get(HTTP + "/old/html")
ttrue(http.status == 200)
ttrue(http.response.contains("<title>index.html</title>"))
http.close()

http = new Http
http.get(HTTP + "/membersOnly")
ttrue(http.status == 410)
http.close()

