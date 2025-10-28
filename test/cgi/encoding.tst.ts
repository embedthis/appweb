/*
    encoding.tst.ts - Test CGI URI encoding and decoding
    Verifies that URL-encoded paths and query strings are properly decoded
 */

import {ttrue, tget} from 'testme'
import {Http, Path, print} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {contains, keyword, match} from './cgi'

//  Test encoded spaces and path normalization
http.get(HTTP + '/cgiProgram.cgi/extra%20long/a/../path/a/..?var%201=value%201')
await http.finalize()
match(http, 'QUERY_STRING', 'var%201=value%201')
match(http, 'SCRIPT_NAME', '/cgiProgram.cgi')
match(http, 'QVAR var 1', 'value 1')
match(http, 'PATH_INFO', '/extra long/path/')

//  Verify PATH_TRANSLATED matches expected filesystem path
let scriptFilename = keyword(http, 'SCRIPT_FILENAME')
let path = new Path(scriptFilename).dirname.join('extra long/path')
let translated = new Path(keyword(http, 'PATH_TRANSLATED'))
ttrue(path.toString() == translated.toString())

//  Test encoded script name (not available on VxWorks)
http.get(HTTP + '/cgi-bin/cgi%20Program?var%201=value%201')
await http.finalize()
match(http, 'QUERY_STRING', 'var%201=value%201')
match(http, 'SCRIPT_NAME', '/cgi-bin/cgi Program')
match(http, 'QVAR var 1', 'value 1')

http.close()
