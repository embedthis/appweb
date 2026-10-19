/*
    host-only.tst - Keep session cookies host-only regardless of the Host field.
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

for (let host of [HOST, 'app.example.com', 'intranet', 'a.b.c.example.com:8080']) {
    let reply = await send(`GET /action/sessionXsrfTest HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`, 'HTTP/1.', true)
    let cookies = reply.text.split('\r\n').filter(line => /^set-cookie:/i.test(line))
    if (cookies.length == 0 || cookies.some(c => /domain=/i.test(c))) {
        console.log('Host: ' + host + ' got:\n' + reply.text)
    }
    ttrue(cookies.length > 0)
    ttrue(cookies.every(c => !/domain=/i.test(c)))
}
