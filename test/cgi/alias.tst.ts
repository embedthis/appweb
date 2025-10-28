/*
    alias.tst.ts - Test CGI execution via aliased routes
    Verifies that CGI programs can be invoked through route aliases
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {contains, keyword, match} from './cgi'

//  Test CGI through first alias
http.get(HTTP + '/MyScripts/cgiProgram')
await http.finalize()
ttrue(http.status == 200)
contains(http, 'cgiProgram: Output')
match(http, 'SCRIPT_NAME', '/MyScripts/cgiProgram')
match(http, 'PATH_INFO', '')
match(http, 'PATH_TRANSLATED', '')

//  Test CGI through second alias with extension
http.get(HTTP + '/YourScripts/cgiProgram.cgi')
await http.finalize()
ttrue(http.status == 200)
contains(http, 'cgiProgram: Output')
http.close()
