/*
    redirect.tst - Redirect directive

    Tests the Redirect directive which sends HTTP redirect responses (3xx status
    codes) to clients. Tests temporary redirects (302), automatic redirect following,
    and gone resources (410).
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test redirect without following - should get 302 with redirect page
http.get(HTTP + "/old.html")
await http.finalize()
ttrue(http.status == 302)
ttrue(http.response.contains("<h1>Moved Temporarily</h1>"))
http.close()

// Test redirect with automatic following enabled
http = new Http
http.followRedirects = true
http.get(HTTP + "/old/html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains("<title>index.html</title>"))
http.close()

// Test "gone" resource (410 status)
http = new Http
http.get(HTTP + "/membersOnly")
await http.finalize()
ttrue(http.status == 410)
http.close()

