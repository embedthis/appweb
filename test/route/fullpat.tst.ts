/*
    fullpat.tst.ts - Test complex route pattern matching
    Verifies advanced regex patterns with character classes and alternation
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test route pattern: ^/route/(user|admin)/{action}/[^a-z]{2}(\.[hH][tT][mM][lL])$
//  Should match with uppercase letters
http.get(HTTP + '/route/user/login/AA.html')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'user')

//  Should not match with mixed case
http.get(HTTP + '/route/user/login/aA.html')
await http.finalize()
ttrue(http.status == 404)
http.close()
