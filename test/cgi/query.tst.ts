/*
    query.tst.ts - Test CGI query string handling
    Verifies that query parameters are correctly parsed and passed to CGI
 */

import {tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

import {contains, keyword, match} from './cgi'

let http: Http = new Http

//  Test simple query string
http.get(HTTP + '/cgiProgram.cgi?a+b+c')
await http.finalize()
match(http, 'QUERY_STRING', 'a+b+c')
contains(http, 'QVAR a b c')

//  Test query variables with extra path
//  Query string vars are passed as-is for GET requests
http.get(HTTP + '/cgiProgram.cgi/extra/path?var1=a+a&var2=b%20b&var3=c')
await http.finalize()
match(http, 'SCRIPT_NAME', '/cgiProgram.cgi')
match(http, 'QUERY_STRING', 'var1=a+a&var2=b%20b&var3=c')
match(http, 'QVAR var1', 'a a')
match(http, 'QVAR var2', 'b b')
match(http, 'QVAR var3', 'c')

//  Test form POST with query string
//  Both query vars and POST vars should be available
http.form(HTTP + '/cgiProgram.cgi/extra/path?var1=a+a&var2=b%20b&var3=c',
    {name: 'Peter', address: '777 Mulberry Lane'})
await http.finalize()
match(http, 'QUERY_STRING', 'var1=a+a&var2=b%20b&var3=c')
match(http, 'QVAR var1', 'a a')
match(http, 'QVAR var2', 'b b')
match(http, 'QVAR var3', 'c')
match(http, 'PVAR name', 'Peter')
match(http, 'PVAR address', '777 Mulberry Lane')

http.close()
