/*
    args.tst - CGI program command line args
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

load("cgi.es")

//
//  Note: args are split at '+' characters and are then shell character encoded. Typical use is "?a+b+c+d
//
http.get(HTTP + "/cgi-bin/cgiProgram")
ttrue(keyword(http, "ARG[0]").contains("cgiProgram"))
ttrue(!http.response.contains("ARG[1]"))

http.get(HTTP + "/cgiProgram.cgi/extra/path")
ttrue(keyword(http, "ARG[0]").contains("cgiProgram"))
ttrue(!http.response.contains("ARG[1]"))

http.get(HTTP + "/cgiProgram.cgi/extra/path?a+b+c")
match(http, "QUERY_STRING", "a+b+c")
ttrue(keyword(http, "ARG[0]").contains("cgiProgram"))
match(http, "ARG.1.", "a")
match(http, "ARG.2.", "b")
match(http, "ARG.3.", "c")

http.get(HTTP + "/cgi-bin/cgiProgram?var1=a+a&var2=b%20b&var3=c")
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
http.close()
