/*
    env-prefix.tst.ts - CgiPrefix sets the FastCGI request-parameter prefix in a route that names only fastHandler
 */

import {ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const URL = HTTP.startsWith('http') ? HTTP : 'http://' + HTTP

let response = await fetch(URL + '/fast-prefix/fastProgram?a=1', {headers: {SWITCHES: '-e'}})
let body = await response.text()
if (!body.includes('<P>X_a=1</P>')) {
    console.log('Status', response.status, 'body:\n' + body)
}
ttrue(response.status == 200)
ttrue(body.includes('<P>X_a=1</P>'))
ttrue(!body.includes('<P>CGI_a=1</P>'))
