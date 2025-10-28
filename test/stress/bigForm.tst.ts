/*
    bigForm.tst.ts - Stress test form size limits
    Verifies that forms exceeding LimitRequestForm are rejected with 413
 */

import {print, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http

//  Create form larger than 32K limit (approximately 50K)
form = {}
for (let i in 2200) {
    form['field_' + i] = Date.ticks
}
http.form(HTTP + '/test.esp', form)
await http.finalize()

//  Verify request rejected as too large
ttrue(http.status == 413)
ttrue(http.response.contains('Request Entity Too Large'))
http.close()
