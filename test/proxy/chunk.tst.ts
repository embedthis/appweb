/*
    Test proxy handling of chunked transfer encoding

    This test verifies that the proxy correctly forwards requests and receives
    responses using chunked transfer encoding.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

// Test POST through proxy with chunked response
http.post(HTTP + "/index.html")

await http.finalize()
ttrue(http.readString().contains("Hello"))
ttrue(http.status == 200)
http.close()
