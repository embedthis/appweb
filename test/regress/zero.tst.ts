/*
    Test server handling of POST with zero Content-Length

    This test verifies that the server correctly processes form POST requests
    with Content-Length: 0 (empty body).
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// POST with zero content length
http.setHeader('Content-Length', 0)
http.setHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
http.post(HTTP + '/test.esp', '')

await http.finalize()
ttrue(http.status == 200)
http.close()
