/*
    quoting.tst - FAST URI encoding and quoting tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

load("fast.es")

http.get(HTTP + "/fast-bin/fastProgram?a+b+c")
match(http, "QUERY_STRING", "a+b+c")
match(http, "QVAR a b c", "")
http.close()

http.get(HTTP + "/fast-bin/fastProgram?a=1&b=2&c=3")
match(http, "QUERY_STRING", "a=1&b=2&c=3")
match(http, "QVAR a", "1")
match(http, "QVAR b", "2")
match(http, "QVAR c", "3")
http.close()

http.get(HTTP + "/fast-bin/fastProgram?a%20a=1%201+b%20b=2%202")
match(http, "QUERY_STRING", "a%20a=1%201+b%20b=2%202")
match(http, "QVAR a a", "1 1 b b=2 2")
http.close()

http.get(HTTP + "/fast-bin/fastProgram?a%20a=1%201&b%20b=2%202")
match(http, "QUERY_STRING", "a%20a=1%201&b%20b=2%202")
match(http, "QVAR a a", "1 1")
match(http, "QVAR b b", "2 2")
http.close()
