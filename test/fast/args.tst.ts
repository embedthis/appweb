/*
    Test FAST CGI program command line argument handling

    This test verifies that FAST programs receive and process command line arguments
    correctly, including query string parsing with special characters and URL encoding.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

import {contains, keyword, match} from "./fast"

// Test basic program invocation and ARG[0]
http.get(HTTP + "/fast-bin/fastProgram")

await http.finalize()
ttrue(keyword(http, "ARG[0]").contains("fastProgram"))
http.close()

// Test query string with multiple variables and URL encoding
// Note: args are split at '+' characters and are then shell character encoded
http.get(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c")

await http.finalize()
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
http.close()
