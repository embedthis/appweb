/*
    Test FAST CGI query string handling and parameter parsing

    This test verifies proper handling of:
    - Simple query string parameters
    - URL-encoded query parameters
    - Combined query string and POST data
    - Distinction between query variables (QVAR) and POST variables (PVAR)
 */

import {tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

import {contains, keyword, match} from "./fast"

let http: Http = new Http

// Test simple query string with space-separated values
http.get(HTTP + "/fast-bin/fastProgram?a+b+c")

await http.finalize()
match(http, "QUERY_STRING", "a+b+c")
contains(http, "QVAR a b c")
http.close()

// Test query string with name=value pairs and URL encoding
http.get(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c")

await http.finalize()
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")
http.close()

// Test combined query string and POST data
// Query variables (QVAR) and POST variables (PVAR) should be separate
http.form(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c",
    { name: "Peter", address: "777 Mulberry Lane" })

await http.finalize()
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
match(http, "QVAR var1", "a a")
match(http, "QVAR var2", "b b")
match(http, "QVAR var3", "c")
match(http, "PVAR name", "Peter")
match(http, "PVAR address", "777 Mulberry Lane")
http.close()
