/*
    root.tst - Test AddLanguageRoot

    Tests the AddLanguageRoot directive which specifies language-specific
    document root directories. Requests are routed to subdirectories based
    on the Accept-Language header.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test language root routing with English preference
http.setHeader("Accept-Language", "en-US,en;q=0.8")
http.get(HTTP + "/lang/root/eng.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello English"))

http.close()
