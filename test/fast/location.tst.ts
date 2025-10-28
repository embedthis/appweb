/*
    Test FAST CGI HTTP redirection responses

    This test verifies that FAST programs can generate proper HTTP redirect
    responses with Location headers (302 Found status).
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
import {contains, keyword, match} from "./fast"

// Test redirection with Location header
let http = new Http
http.followRedirects = false
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-l%20/index.html")

await http.finalize()
ttrue(http.status == 302)
http.close()
