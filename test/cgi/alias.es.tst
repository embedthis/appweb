/*
    alias.tst - CGI via aliased routes
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

load("cgi.es")

http.get(HTTP + "/MyScripts/cgiProgram")
ttrue(http.status == 200)
contains(http, "cgiProgram: Output")
match(http, "SCRIPT_NAME", "/MyScripts/cgiProgram")
match(http, "PATH_INFO", "")
match(http, "PATH_TRANSLATED", "")

http.get(HTTP + "/YourScripts/cgiProgram.cgi")
ttrue(http.status == 200)
contains(http, "cgiProgram: Output")
http.close()
