/*
    suffix.tst - Test AddLanguage

    Tests the AddLanguage directive which maps language codes to file suffixes.
    For example, requesting index.html with Accept-Language: en may serve
    index.en.html if it exists.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test language suffix mapping for English
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/suffix/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("English Suffix"))

http.close()
