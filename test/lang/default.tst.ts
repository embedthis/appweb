/*
    default.tst - Test DefaultLanguage

    Tests the DefaultLanguage directive which sets the default language for
    content negotiation when no Accept-Language header is provided or no
    matching language is available.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test default language (French) is served when no Accept-Language header present
http.get(HTTP + "/lang/default/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("Bonjour"))

http.close()
