/*
    Test FAST CGI custom HTTP status code responses

    This test verifies that FAST programs can set custom HTTP status codes
    in their responses (e.g., 711 for testing purposes).
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
import {contains, keyword, match} from "./fast"

// Test custom status code 711
let http = new Http
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-s%20711")

await http.finalize()
ttrue(http.status == 711)
http.close()
