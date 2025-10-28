/*
    post.tst.ts - Test CGI POST method handling
    Verifies that CGI can receive and process POST data and form submissions
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http
import {contains, keyword, match} from './cgi'

//  Test simple POST with data
http.post(HTTP + '/cgi-bin/cgiProgram', 'Some data')
await http.finalize()
ttrue(http.status == 200)
match(http, 'CONTENT_LENGTH', '9')

//  Test form submission
http.form(HTTP + '/cgi-bin/cgiProgram', {name: 'John', address: '700 Park Ave'})
await http.finalize()
ttrue(http.status == 200)
contains(http, 'CONTENT_LENGTH')
match(http, 'PVAR name', 'John')
match(http, 'PVAR address', '700 Park Ave')
http.close()
