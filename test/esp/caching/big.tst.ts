/*
    big.tst.ts - ESP cache large file test
    Verifies that ESP caching works correctly with large files that require chunking
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http
http.cache = false

http.get(HTTP + "/cache/clear")
await http.finalize()
ttrue(http.status == 200)

http.get(HTTP + "/cache/big")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header("transfer-encoding") == "chunked")
ttrue(http.response.contains("Line: 00499 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))

http.reset()
http.cache = false
http.get(HTTP + "/cache/big")
await http.finalize()
ttrue(http.status == 200)
ttrue(!http.header("transfer-encoding"))
ttrue(http.header("content-length") == 39000)
ttrue(http.response.contains("Line: 00499 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))

http.close()
