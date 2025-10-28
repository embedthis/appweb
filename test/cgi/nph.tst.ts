/*
    nph.tst.ts - Test CGI custom header handling
    Verifies that CGI can emit custom response headers
    Note: NPH (Non-Parsed Header) requires HTTP/1.0; this tests custom headers via regular CGI
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'
let http = new Http

//  Test multiple custom headers
http.setHeader('SWITCHES', '-h 2')
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header('X-CGI-0') == 'A loooooooooooooooooooooooong string')
ttrue(http.header('X-CGI-1') == 'A loooooooooooooooooooooooong string')

//  Test single custom header with connection reuse
http.reset()
http.setHeader('SWITCHES', '-h 1')
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.header('X-CGI-0') == 'A loooooooooooooooooooooooong string')

http.close()
