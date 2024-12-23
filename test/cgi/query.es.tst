/*
    query.tst - CGI query string handling
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

load("cgi.es")

let http: Http = new Http

/*
http.get(HTTP + "/cgiProgram.cgi/extra/path?a=b&c=d&e=f")
match(http, "SCRIPT_NAME", "/cgiProgram.cgi")
match(http, "PATH_INFO", "/extra/path")
contains(http, "QVAR a=b")
contains(http, "QVAR c=d")
*/

http.get(HTTP + "/cgiProgram.cgi?a+b+c")
match(http, "QUERY_STRING", "a+b+c")
contains(http, "QVAR a b c")

//
//  Query string vars should not be turned into variables for GETs
//  Extra path only supported for cgi programs with extensions.
//
http.get(HTTP + "/cgiProgram.cgi/extra/path?var1=a+a&var2=b%20b&var3=c")
match(http, "SCRIPT_NAME", "/cgiProgram.cgi")
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")

//
//  Post data should be turned into variables
//
http.form(HTTP + "/cgiProgram.cgi/extra/path?var1=a+a&var2=b%20b&var3=c", 
    { name: "Peter", address: "777 Mulberry Lane" })
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")
match(http, "PVAR name", "Peter")
match(http, "PVAR address", "777 Mulberry Lane")

http.close()
