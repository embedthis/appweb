/*
    query.tst - FAST query string handling
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

load("fast.es")

let http: Http = new Http

http.get(HTTP + "/fast-bin/fastProgram?a+b+c")
match(http, "QUERY_STRING", "a+b+c")
contains(http, "QVAR a b c")
http.close()

//
//  Query string vars should not be turned into variables for GETs
//
http.get(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c")
http.wait()
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")
http.close()

//
//  Post data should be turned into variables
//
http.form(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c", 
    { name: "Peter", address: "777 Mulberry Lane" })
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")
match(http, "PVAR name", "Peter")
match(http, "PVAR address", "777 Mulberry Lane")
http.close()
