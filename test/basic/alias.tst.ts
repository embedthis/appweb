/*
    alias.tst - Alias http tests

    Tests URL aliasing functionality where URLs are mapped to different physical
    paths or files. Tests directory aliases, file aliases, and case-sensitive aliases.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Test directory alias mapping
http.get(HTTP + "/aliasDir/atest.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains("alias/atest.html"))

// Test file alias mapping
http.get(HTTP + "/aliasFile/")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains("alias/atest.html"))

// Test case-sensitive alias mapping
http.get(HTTP + "/AliasDocs/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains("My Documents/index.html"))

http.close()
