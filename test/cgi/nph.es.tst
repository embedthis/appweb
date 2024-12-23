/*
    npg.tst - CGI non-parsed header tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
load("cgi.es")
let http = new Http

/* VxWorks doesn't have "nph-cgiProgram" */
http.setHeader("SWITCHES", "-n")
http.get(HTTP + "/cgi-bin/nph-cgiProgram")
ttrue(http.status == 200)
ttrue(http.header("X-CGI-CustomHeader") == "Any value at all")

//  Do another to make sure it handles the content correctly
http.reset()
http.setHeader("SWITCHES", "-n")
http.get(HTTP + "/cgi-bin/nph-cgiProgram")
ttrue(http.status == 200)
ttrue(http.header("X-CGI-CustomHeader") == "Any value at all")

http.close()
