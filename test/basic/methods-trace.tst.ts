/*
    methods-trace.tst.ts - TRACE
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

const CLOSE = 'Host: ' + HOST + '\r\nConnection: close\r\n\r\n'

//  TRACE is answered on the route configured for it, with the required content type
let reply = await send('TRACE /trace/index.html HTTP/1.1\r\nX-Probe: probe-value\r\n' + CLOSE,
    'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))
ttrue(reply.text.includes('message/http'))

ttrue(reply.decoded.includes('TRACE /trace/index.html HTTP/1.1\r\n'))
ttrue(reply.decoded.includes('X-Probe: probe-value\r\n'))

reply = await send('TRACE /trace/index.html HTTP/1.1\r\n' +
    'Authorization: Basic am9zaHVhOnBhc3Mx\r\n' +
    'Proxy-Authorization: Basic cHJveHk6c2VjcmV0\r\n' +
    'Cookie: -http-session-=must-not-be-echoed\r\n' +
    'X-Kept: kept\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))
ttrue(reply.decoded.includes('X-Kept: kept'))
ttrue(!reply.text.includes('am9zaHVhOnBhc3Mx'))
ttrue(!reply.text.includes('cHJveHk6c2VjcmV0'))
ttrue(!reply.text.includes('must-not-be-echoed'))

//  TRACE is refused where the route does not permit it
reply = await send('TRACE /index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(!reply.text.includes('200 OK'))

//  OPTIONS advertises exactly the methods the route permits, and TRACE is among them
reply = await send('OPTIONS /trace/index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))

let allow = ''
for (let line of reply.text.split('\r\n')) {
    if (line.toLowerCase().startsWith('allow:')) {
        allow = line.slice(6).trim()
    }
}
teq(allow.split(',').map((s: string) => s.trim()).sort().join(','), 'GET,OPTIONS,POST,TRACE')
