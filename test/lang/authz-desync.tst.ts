/*
    authz-desync.tst - Test that language suffix updates do not re-decode paths after route conditions.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const SECRET = "LANG-DESYNC-PRIVATE-SECRET"
let http: Http = new Http

http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/desync/public/index.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("LANG-DESYNC-PUBLIC"))
http.close()

http = new Http
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/desync/private/secret.html")
await http.finalize()
ttrue(http.status != 200 || !http.readString().contains(SECRET))
http.close()

http = new Http
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/desync/public/..%252fprivate/secret.html")
await http.finalize()
ttrue(http.status != 200 || !http.readString().contains(SECRET))
http.close()

http = new Http
http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/desync/public/%252e%252e%252fprivate/secret.html")
await http.finalize()
ttrue(http.status != 200 || !http.readString().contains(SECRET))
http.close()
