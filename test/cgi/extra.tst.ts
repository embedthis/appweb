/*
    extra.tst.ts - Test CGI extra path information handling
    Verifies that PATH_INFO and PATH_TRANSLATED are correctly set
 */

import {ttrue, tget} from 'testme'
import {Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {contains, keyword, match} from './cgi'

//  Test without extra path
http.get(HTTP + '/cgiProgram.cgi')
await http.finalize()
ttrue(http.status == 200)
match(http, 'PATH_INFO', '')
match(http, 'PATH_TRANSLATED', '')

//  Test with extra path information
http.get(HTTP + '/cgiProgram.cgi/extra/path')
await http.finalize()
match(http, 'PATH_INFO', '/extra/path')

//  Verify PATH_TRANSLATED matches filesystem path
let scriptFilename = keyword(http, 'SCRIPT_FILENAME')
let path = new Path(scriptFilename).dirname.join('extra/path')
let translated = new Path(keyword(http, 'PATH_TRANSLATED'))
ttrue(path.toString() == translated.toString())

http.close()
