/*
    Test FAST CGI URI encoding and parameter quoting

    This test verifies proper handling of URL-encoded parameters:
    - Plus signs as spaces
    - Percent-encoded spaces (%20)
    - Parameter names with spaces
    - Proper parsing of & vs + delimiters
 */

import {tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

import {contains, keyword, match} from "./fast"

// Test simple plus-separated values
let http = new Http
http.get(HTTP + "/fast-bin/fastProgram?a+b+c")
await http.finalize()
match(http, "QUERY_STRING", "a+b+c")
match(http, "QVAR a b c", "")
http.close()

// Test standard name=value pairs
http = new Http
http.get(HTTP + "/fast-bin/fastProgram?a=1&b=2&c=3")
await http.finalize()
match(http, "QUERY_STRING", "a=1&b=2&c=3")
match(http, "QVAR a", "1")
match(http, "QVAR b", "2")
match(http, "QVAR c", "3")
http.close()

// Test mixed encoding with plus separator (ambiguous parsing)
http = new Http
http.get(HTTP + "/fast-bin/fastProgram?a%20a=1%201+b%20b=2%202")
await http.finalize()
match(http, "QUERY_STRING", "a%20a=1%201+b%20b=2%202")
match(http, "QVAR a a", "1 1 b b=2 2")
http.close()

// Test URL-encoded spaces with & separator
http = new Http
http.get(HTTP + "/fast-bin/fastProgram?a%20a=1%201&b%20b=2%202")
await http.finalize()
match(http, "QUERY_STRING", "a%20a=1%201&b%20b=2%202")
match(http, "QVAR a a", "1 1")
match(http, "QVAR b b", "2 2")
http.close()
