/*
    get.tst.ts - Test ESP GET request handling
    Verifies that ESP pages can handle GET requests and render properly
 */

import {ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test basic ESP GET request
http.get(HTTP + '/test.esp')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('ESP Test Program'))
ttrue(http.response.contains('Product Name'))
http.close()

//  Test case-insensitive file matching on Windows
if (Config.OS == 'windows') {
    http.get(HTTP + '/teST.eSP')
    await http.finalize()
    ttrue(http.status == 200)
    http.close()
}
