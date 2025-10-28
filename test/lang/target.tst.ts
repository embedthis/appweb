/*
    target.tst - Test AddLanguage

    Tests the AddLanguage directive with target language mapping. Similar to
    suffix tests but may use different mapping strategies for language-specific
    content delivery.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test target language mapping for English
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/target/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("English Suffix"))

http.close()
