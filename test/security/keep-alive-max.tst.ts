/*
    keep-alive-max.tst.ts - An overlong Keep-Alive max= value
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

for (let max of ['20244444444444444440', '99999999999999999999', '9223372036854775808', '-99999999999999999999']) {
    let request = `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nConnection: keep-alive\r\nKeep-Alive: max=${max}\r\n\r\n`
    let reply = await send(request, 'Hello /index.html')
    if (!reply.decoded.includes('200 OK')) {
        console.log('Keep-Alive: max=' + max + ' got:\n' + reply.text)
    }
    ttrue(reply.decoded.includes('200 OK'))
    ttrue(reply.decoded.includes('Hello /index.html'))
    ttrue(!reply.closed)
}
