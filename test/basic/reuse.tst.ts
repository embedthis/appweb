/*
    reuse.tst - Test Http reuse for multiple requests

    Tests HTTP connection reuse (keep-alive) by making multiple sequential
    requests using the same Http object to verify connection pooling works correctly.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Test multiple sequential requests using the same connection
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.close()
