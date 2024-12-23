/*
    location.tst - FAST redirection responses
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
load("fast.es")

let http = new Http
http.setHeader("SWITCHES", "-l%20/index.html")
http.followRedirects = false
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(http.status == 302)
http.close()
