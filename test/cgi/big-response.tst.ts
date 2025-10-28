/*
    big-response.tst.ts - Test large CGI response data
    Verifies that CGI can generate and server can receive large responses
 */

import {print, tdepth, tget, ttrue} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'

//  Test sizes scale with depth (in units of 102400)
let sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
let len = sizes[tdepth()] * 102400
let bytes = len * 11

//  Request large response from CGI
let http = new Http
http.setHeader('SWITCHES', '-b%20' + len)
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()

//  Verify response size matches expected
ttrue(http.status == 200)
ttrue(bytes == http.response.length)
http.close()
