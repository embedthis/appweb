/*
    chunk.tst - Test chunked transfer encoding for response data

    Tests HTTP chunked transfer encoding where response data is sent in chunks
    rather than as a complete response with Content-Length. Basic test to ensure
    chunked responses are handled correctly.

    TODO - Test various chunk sizes and streaming scenarios
    TODO - Add ability to set chunk size for testing different buffer sizes
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test basic chunked transfer encoding with POST request
http.post(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.close()
