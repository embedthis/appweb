/*
    manual.tst.ts - ESP manual cache control test
    Verifies that ESP manual caching mode allows programmatic cache updates
 */

import {ttrue, tget} from 'testme'
import {Http, deserialize} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/cache/clear")
await http.finalize()
ttrue(http.status == 200)

http.get(HTTP + "/cache/manual")
await http.finalize()
ttrue(http.status == 200)
let resp = deserialize(http.response)
let first = resp.number
ttrue(resp.uri == "/cache/manual")
ttrue(resp.query == "null")

http.get(HTTP + "/cache/manual")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number == first)
ttrue(resp.uri == "/cache/manual")
ttrue(resp.query == "null")

http.get(HTTP + "/cache/update?updated=true")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == "done")

http.get(HTTP + "/cache/manual")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.query == "updated=true")

http.get(HTTP + "/cache/manual?send")
await http.finalize()
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.query == "updated=true")

http.close()
