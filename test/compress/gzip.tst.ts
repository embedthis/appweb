/*
    gzip.tst - Compressed content

    Tests HTTP gzip compression. The client indicates it can accept gzip-encoded
    responses via the Accept-Encoding header, and the server should compress the
    response if configured to do so.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test gzip compression support by setting Accept-Encoding header
http.setHeader("Accept-Encoding", "gzip")
http.get(HTTP + "/compress/compressed.txt")
await http.finalize()
ttrue(http.status == 200)

http.close()
