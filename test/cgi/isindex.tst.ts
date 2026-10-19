/*
    isindex.tst.ts - Reject options and decoded = in CGI search terms.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {keyword, match} from './cgi'

for (const query of ['-d+-r+-c', '-s', '-s+511', 'red+-r', '%2Dr', '+-r', '-']) {
    http.get(HTTP + '/cgi-bin/cgiProgram?' + query)
    await http.finalize()
    ttrue(http.status == 400)
    ttrue(!http.response.contains('ARG['))
    http.close()
}

for (const query of ['-d+foo%3Dbar', 'foo%3Dbar', 'a+b%3d']) {
    http.get(HTTP + '/cgi-bin/cgiProgram?' + query)
    await http.finalize()
    ttrue(http.status == 400)
    ttrue(!http.response.contains('ARG['))
    http.close()
}

http.get(HTTP + '/cgi-bin/cgiProgram?red+green+blue')
await http.finalize()
ttrue(http.status == 200)
match(http, 'QUERY_STRING', 'red+green+blue')
match(http, 'ARG.1.', '--')
match(http, 'ARG.2.', 'red')
match(http, 'ARG.3.', 'green')
match(http, 'ARG.4.', 'blue')
ttrue(!http.response.contains('ARG[5]'))
http.close()

http.get(HTTP + '/cgi-bin/cgiProgram?red-green+a--b')
await http.finalize()
ttrue(http.status == 200)
match(http, 'ARG.1.', '--')
match(http, 'ARG.2.', 'red-green')
match(http, 'ARG.3.', 'a--b')
http.close()

http.get(HTTP + '/cgi-bin/cgiProgram?a=b&c=d')
await http.finalize()
ttrue(http.status == 200)
match(http, 'QUERY_STRING', 'a=b&c=d')
ttrue(!http.response.contains('ARG[1]'))
http.close()

for (const query of ['', '?', '?+++']) {
    http.get(HTTP + '/cgi-bin/cgiProgram' + query)
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(keyword(http, 'ARG[0]').contains('cgiProgram'))
    ttrue(!http.response.contains('ARG[1]'))
    http.close()
}
