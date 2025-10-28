/*
    include.tst.ts - Test ESP include directive
    Verifies that ESP pages can include other ESP pages
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test ESP page including another
http.get(HTTP + '/outer.esp')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Hello from inner text'))
http.close()
