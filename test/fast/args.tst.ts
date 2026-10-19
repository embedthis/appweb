/*
    Test FAST CGI program command line argument handling

    This test verifies that FAST programs receive and process command line arguments
    correctly, including query string parsing with special characters and URL encoding.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

import {contains, keyword, match} from "./fast"

// Test basic program invocation and ARG[0]
http.get(HTTP + "/fast-bin/fastProgram")

await http.finalize()
ttrue(keyword(http, "ARG[0]").contains("fastProgram"))
http.close()

//  A reused FastCGI process must never inherit command-line arguments from any request's query.
for (const query of ['a++b', '+a', 'a+', 'a+b']) {
    http.get(HTTP + '/fast-bin/fastProgram?' + query)
    await http.finalize()
    match(http, 'QUERY_STRING', query)
    ttrue(!http.response.contains('ARG[1]'))
    http.close()
}

//  Query variables stay in the request environment, separate from the reused process's argv.
//  URL encoding and '+' separators are preserved in QUERY_STRING.
http.get(HTTP + "/fast-bin/fastProgram?var1=a+a&var2=b%20b&var3=c")

await http.finalize()
match(http, "QUERY_STRING", "var1=a+a&var2=b%20b&var3=c")
http.close()
