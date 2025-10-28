/*
    limits.tst.ts - ESP cache size limits test
    Verifies that ESP respects LimitCacheItem and doesn't cache overly large items
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/cache/huge")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header("Transfer-Encoding") == "chunked")
ttrue(!http.header("Content-Length"))
ttrue(http.response.contains("Line: 09999 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))
http.close()

http = new Http
http.get(HTTP + "/cache/huge")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header("Transfer-Encoding") == "chunked")
ttrue(!http.header("Content-Length"))
ttrue(http.response.contains("Line: 09999 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))
http.close()
