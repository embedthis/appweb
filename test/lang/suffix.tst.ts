/*
    suffix.tst - Test AddLanguage

    Tests the AddLanguage directive which maps language codes to file suffixes.
    For example, requesting index.html with Accept-Language: en may serve
    index.en.html if it exists.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test language suffix mapping for English
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/suffix/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("English Suffix"))
http.close()

http = new Http
http.setHeader("Accept-Language", "en")
const probe = "report.a" + "-".repeat(220) + ".html"
http.get(HTTP + "/lang/token/" + probe)
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString() == "name=" + probe + ";first=" + probe + ";match=/" + probe + ";path=/" + probe)

http.close()
