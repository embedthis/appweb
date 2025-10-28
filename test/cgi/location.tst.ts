/*
    location.tst.ts - Test CGI redirect responses via Location header
    Verifies that CGI can issue HTTP redirects
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'

//  Test CGI redirect
let http = new Http
http.setHeader('SWITCHES', '-l%20/index.html')
http.followRedirects = false
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()

//  Verify redirect status
ttrue(http.status == 302)
http.close()
