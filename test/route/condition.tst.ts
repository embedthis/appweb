/*
    condition.tst.ts - Test route condition matching
    Verifies that route conditions are evaluated correctly
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test route with condition
http.get(HTTP + '/route/cond')
await http.finalize()

//  Verify condition matched and returned expected response
ttrue(http.status == 200)
ttrue(http.response == 'http')
http.close()
