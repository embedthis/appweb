/*
    directives.tst.ts - Test ESP rendering directives
    Verifies that ESP directives like render(), write(), and safe output work correctly
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test ESP directives
http.get(HTTP + '/directives.esp?weather=sunny')
await http.finalize()
ttrue(http.status == 200)
let r = http.response

//  Verify directive outputs
ttrue(r.contains('ESP Directives'))
ttrue(r.contains('Today\'s Message: Hello World'))
ttrue(r.contains('Lucky Number: 42'))
ttrue(r.contains('Formatted Number: 12,345,678'))
ttrue(r.contains('Safe Strings: &lt;bold&gt;'))
ttrue(r.contains('Weather: sunny'))
http.close()
