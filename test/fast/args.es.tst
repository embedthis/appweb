/*
    args.tst - FAST program command line args
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

load("fast.es")

//
//  Note: args are split at '+' characters and are then shell character encoded. Typical use is "?a+b+c+d
//
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(keyword(http, "ARG[0]").contains("fastProgram"))
http.close()

http.get(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c")
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
http.close()
