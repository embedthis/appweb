/*
    auth.tst.ts - Test route authorization condition
    Verifies that unauthorized requests to protected routes return 401 status
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Attempt to access protected resource without authentication
http.get(HTTP + '/route/auth/basic.html')
await http.finalize()

//  Verify unauthorized access is denied
ttrue(http.status == 401)
http.close()
