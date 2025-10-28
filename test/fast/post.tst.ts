/*
    Test FAST CGI POST method handling

    This test verifies that FAST programs correctly receive and process:
    - Simple POST data with Content-Length
    - Form-encoded POST data with multiple fields
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http
import {contains, keyword, match} from "./fast"

// Test simple POST with text data
http.post(HTTP + "/fast-bin/fastProgram", "Some data")

await http.finalize()
ttrue(http.status == 200)
match(http, "CONTENT_LENGTH", "9")
http.close()

// Test form-encoded POST with multiple fields
http.form(HTTP + "/fast-bin/fastProgram", {name: "John", address: "700 Park Ave"})

await http.finalize()
ttrue(http.status == 200)
contains(http, "CONTENT_LENGTH")
match(http, "PVAR name", "John")
match(http, "PVAR address", "700 Park Ave")
http.close()
