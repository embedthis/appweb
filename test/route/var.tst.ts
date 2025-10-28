/*
    var.tst.ts - Test route variable updates
    Verifies that route variables can be updated from request headers
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Send request with custom header
http.setHeader('From', 'Mars')
http.get(HTTP + '/route/update/var')
await http.finalize()

//  Verify route variable was updated from header
ttrue(http.status == 200)
ttrue(http.response == 'Mars')
http.close()
