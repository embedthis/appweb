/*
    Test FAST CGI handling of large response data

    This test verifies that FAST programs can generate and send large responses.
    The test size scales with test depth (10KB to 5MB of output).
 */

import {tdepth, tget, ttrue} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
import {contains, keyword, match} from "./fast"

// Test sizes in lines based on test depth
// Depths:    0  1  2  3   4   5   6    7    8    9
let sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]
let lines = sizes[tdepth()] * 10240

// Request FAST program to generate large output
let http = new Http
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-b%20" + lines)

await http.finalize()
ttrue(http.status == 200)

// Verify response size (10 bytes per line)
let len = lines * 10
ttrue(len <= http.response.length)
http.close()
