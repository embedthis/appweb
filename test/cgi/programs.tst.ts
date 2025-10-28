/*
    programs.tst.ts - Test various CGI program invocation methods
    Verifies that CGI programs can be invoked through different paths and extensions
 */

import {ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

import {contains, keyword, match} from './cgi'

let http: Http = new Http

//  Test direct invocation from cgi-bin
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(http.status == 200)
contains(http, 'cgiProgram: Output')

//  Test invocation via .cgi extension
http.get(HTTP + '/cgiProgram.cgi')
await http.finalize()
ttrue(http.status == 200)
contains(http, 'cgiProgram: Output')

//  Windows-specific tests
if (Config.OS == 'windows') {
    //  Test .exe invocation
    http.get(HTTP + '/cgi-bin/cgiProgram.exe')
    await http.finalize()
    ttrue(http.status == 200)
    contains(http, 'cgiProgram: Output')

    //  Test shebang script
    http.get(HTTP + '/cgi-bin/test')
    await http.finalize()
    ttrue(http.status == 200)
    contains(http, 'cgiProgram: Output')

    //  Test batch file
    http.get(HTTP + '/cgi-bin/test.bat')
    await http.finalize()
    ttrue(http.status == 200)
    contains(http, 'cgiProgram: Output')
}

//  Test script without extension
http.get(HTTP + '/cgi-bin/testScript')
await http.finalize()
ttrue(http.status == 200)
contains(http, 'cgiProgram: Output')
http.close()
