/*
    args.tst.ts - Test CGI program command line argument handling
    Verifies that query parameters are correctly split and passed as CGI arguments
    Note: Arguments are split at '+' characters and shell-encoded
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {contains, keyword, match} from './cgi'

//  Test with no arguments
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(keyword(http, 'ARG[0]').contains('cgiProgram'))
ttrue(!http.response.contains('ARG[1]'))

//  Test with extra path but no query string
http.get(HTTP + '/cgiProgram.cgi/extra/path')
await http.finalize()
ttrue(keyword(http, 'ARG[0]').contains('cgiProgram'))
ttrue(!http.response.contains('ARG[1]'))

//  Test with query string split into arguments
http.get(HTTP + '/cgiProgram.cgi/extra/path?a+b+c')
await http.finalize()
match(http, 'QUERY_STRING', 'a+b+c')
ttrue(keyword(http, 'ARG[0]').contains('cgiProgram'))
match(http, 'ARG.1.', 'a')
match(http, 'ARG.2.', 'b')
match(http, 'ARG.3.', 'c')

//  Test with URL-encoded query variables
http.get(HTTP + '/cgi-bin/cgiProgram?var1=a+a&var2=b%20b&var3=c')
await http.finalize()
match(http, 'QUERY_STRING', 'var1=a+a&var2=b%20b&var3=c')
http.close()
