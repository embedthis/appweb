/*
    request-id.tst.ts - A FastCGI record for another request is refused, not delivered
 */

import {teq, ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

let response = await fetch(HTTP + '/fast-bin/fastProgram?SWITCHES=' + encodeURIComponent('-r 8'))
let body = await response.text()
if (response.status != 502) {
    console.log(`status ${response.status}, body ${JSON.stringify(body)}`)
}
teq(response.status, 502)
ttrue(!body.includes('OTHER'))

response = await fetch(HTTP + '/fast-bin/fastProgram?SWITCHES=' + encodeURIComponent('-r 4'))
teq(response.status, 404)
teq(await response.text(), 'GONE')
