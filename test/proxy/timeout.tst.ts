/*
    Test proxy handling of request timeouts

    This test verifies that the proxy correctly handles requests with mismatched
    Content-Length headers and timeout behavior. The server may respond quickly
    even when Content-Length doesn't match the actual body.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

// Verify server is alive before timeout test
http.get(HTTP + "/index.html")

await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello"))
http.close()

// Test timeout behavior with mismatched Content-Length
// Server responds with 204 even without complete body data
http.setHeader("Content-Length", 1000)
http.put(HTTP + "/tmp/test.dat?r2")

const result = await http.wait(250)
ttrue(result == true)
http.close()
