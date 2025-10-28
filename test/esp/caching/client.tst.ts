/*
    client.tst.ts - ESP client-side cache control test
    Verifies that ESP sets correct Cache-Control headers for client caching
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/cache/client")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header("Cache-Control") == "public, max-age=3600")

http.close()


