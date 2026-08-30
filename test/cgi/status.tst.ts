/*
    status.tst.ts - Test CGI custom HTTP status codes
    Verifies that CGI can set a custom response status code, within the range HTTP defines.
    See header-injection.tst.ts for the full corpus of rejected Status values.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'

//  Test custom status code 511
let http = new Http
http.setHeader('SWITCHES', '-s%20511')
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()

//  Verify custom status was set
ttrue(http.status == 511)
http.close()

//  A status outside 200-599 is not a status the server can relay, and fails the request
http.reset()
http.setHeader('SWITCHES', '-s%20711')
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(http.status == 502)
http.close()
