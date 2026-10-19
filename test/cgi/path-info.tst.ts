/*
    path-info.tst.ts - Handler selection for a script that carries extra path information
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'
import {match} from './cgi'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

http.get(HTTP + '/cgiProgram.cgi/extra/path')
await http.finalize()
ttrue(http.status == 200)
match(http, 'PATH_INFO', '/extra/path')
match(http, 'SCRIPT_NAME', '/cgiProgram.cgi')

http.get(HTTP + '/cgiProgram.cgi/')
await http.finalize()
ttrue(http.status == 200)
match(http, 'PATH_INFO', '/')

http.get(HTTP + '/cgiProgram.cgi/a.b/c')
await http.finalize()
ttrue(http.status == 200)
match(http, 'PATH_INFO', '/a.b/c')

for (let uri of ['/missing.cgi/extra', '/nodir/cgiProgram.cgi/extra', '/dotted.dir/missing/extra']) {
    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status == 404)
    ttrue(!http.response.contains('PATH_INFO'))
}

http.get(HTTP + '/dotted.dir/plain')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Hello plain'))

http.get(HTTP + '/index.html/extra')
await http.finalize()
ttrue(http.status == 404)

http.close()
