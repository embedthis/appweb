/*
    update-auth.tst.ts - Protected route updates must not run after authorization denial.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Config, Http, Path} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const CAN_RUN_TOUCH = Config.OS != 'VXWORKS' && Config.OS != 'WIN'

let http: Http = new Http
let path = new Path('../route-update-auth-cmd.tmp')
if (CAN_RUN_TOUCH) {
    path.remove()
    ttrue(!path.exists)
}

http.setHeader('Accept-Language', 'en')
http.get(HTTP + '/route/update/auth')
await http.finalize()
ttrue(http.status == 401)
if (CAN_RUN_TOUCH) {
    ttrue(!path.exists)
}
http.close()

http = new Http
http.setHeader('Accept-Language', 'en')
http.setCredentials('joshua', 'pass1')
http.get(HTTP + '/route/update/auth')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'authorized:en')
if (CAN_RUN_TOUCH) {
    ttrue(path.exists)
    ttrue(path.remove())
}
http.close()
