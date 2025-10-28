/*
    token.tst.ts - Test tokenized route parameters
    Verifies that route tokens are extracted and processed correctly
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test route with tokens
http.get(HTTP + '/route/tokens/login?fast')
await http.finalize()

//  Verify tokens were extracted and combined
ttrue(http.status == 200)
ttrue(http.response == 'login-fast')
http.close()
