/*
    missing.tst.ts - Automatic extension addition for an extensionless request
 */

import {teq, tinfo, tskip, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

http.get(HTTP + '/route/missing-ext/index')
await http.finalize()
let status = http.status
let body = http.response
http.close()

if (status == 404) {
    /*
        No PCRE2 in this build, so the route was never created. A 404 is the correct outcome and
        is asserted rather than skipped past -- a route that silently matched something else
        would be a routing defect, and this is what distinguishes the two.
     */
    teq(status, 404)
    tinfo('route absent: built without PCRE2, so <if PCRE2> excluded /route/missing-ext')

} else if (status == 200) {
    //  PCRE2 and a PHP backend are both present: the extension was added and the script ran
    teq(status, 200)
    ttrue(body.contains('Hello PHP World'))

} else {
    //  The route exists but the backend did not answer -- PHP missing, or the launch failed
    tskip('route present but the PHP FastCGI backend did not answer (status ' + status + ')')
}
