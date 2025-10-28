/*
    status.tst.ts - Test CGI custom HTTP status codes
    Verifies that CGI can set custom response status codes
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'

//  Test custom status code 711
let http = new Http
http.setHeader('SWITCHES', '-s%20711')
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()

//  Verify custom status was set
ttrue(http.status == 711)
http.close()
