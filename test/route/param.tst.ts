/*
    param.tst.ts - Test route matching by parameter value
    Verifies that routes can match based on query and form parameters
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test query parameter - should fail with 'ralph'
http.get(HTTP + '/route/param?name=ralph')
await http.finalize()
ttrue(http.status == 404)
http.close()

//  Test query parameter - should succeed with 'peter'
http.get(HTTP + '/route/param?name=peter')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'peter')
http.close()

//  Test form parameter - should fail with 'ralph'
http.form(HTTP + '/route/param', {name: 'ralph'})
await http.finalize()
ttrue(http.status == 404)
http.close()

//  Test form parameter - should succeed with 'peter'
http.form(HTTP + '/route/param', {name: 'peter'})
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'peter')
http.close()
