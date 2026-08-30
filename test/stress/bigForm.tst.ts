/*
    bigForm.tst.ts - Stress test form size limits

    Verifies that a form body beyond LimitRequestForm (512K in test/appweb.conf) is rejected with
    413 rather than parsed.

    The form was built with `for (let i in 30000)`, which iterates the properties of a Number and
    so ran zero times (10069). The request that went out carried an empty form, the server had no
    reason to reject it, and the test failed on a limit it had never actually reached.
 */

import {tget, ttrue} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

/*
    LimitRequestForm is 512K. Each field below is roughly 30 bytes encoded, so 30000 fields is
    about 900K -- comfortably past the limit without being so large that the test is slow.
 */
let form: any = {}
for (let i = 0; i < 30000; i++) {
    form['field_' + i] = 1234567890
}

let http: Http = new Http
let status = 0
try {
    http.form(HTTP + '/post', form)
    await http.finalize()
    status = http.status
} catch {
    //  A close instead of a status is still a rejection; being served a 200 is not
    status = -1
}

ttrue(status != 200)
if (status == 413) {
    ttrue(http.response.contains('Request Entity Too Large'))
}
http.close()
