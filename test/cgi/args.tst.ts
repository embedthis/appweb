/*
    args.tst.ts - Check + separated CGI arguments after the end-of-options marker.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

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
match(http, 'ARG.1.', '--')
match(http, 'ARG.2.', 'a')
match(http, 'ARG.3.', 'b')
match(http, 'ARG.4.', 'c')

//  Test with URL-encoded query variables
http.get(HTTP + '/cgi-bin/cgiProgram?var1=a+a&var2=b%20b&var3=c')
await http.finalize()
match(http, 'QUERY_STRING', 'var1=a+a&var2=b%20b&var3=c')
http.close()

//  Delimiters do not become trailing empty argv entries when the allocation count exceeds the tokens.
for (const [query, args] of [
    ['a++b', ['a', 'b']], ['+a', ['a']], ['a+', ['a']],
    ['a+b', ['a', 'b']], ['+++', []],
] as [string, string[]][]) {
    http.get(HTTP + '/cgi-bin/cgiProgram?' + query)
    await http.finalize()
    let argind = 1
    if (args.length) {
        match(http, 'ARG.1.', '--')
        argind = 2
    }
    for (let i = 0; i < args.length; i++) {
        match(http, 'ARG.' + (argind + i) + '.', args[i])
    }
    ttrue(!http.response.contains('ARG[' + (argind + args.length) + ']'))
    http.close()
}
