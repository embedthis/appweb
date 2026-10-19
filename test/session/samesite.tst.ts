/*
    samesite.tst - Default session and XSRF cookies to SameSite=Lax.
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

let reply = await send(`GET /action/sessionXsrfTest HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`, 'HTTP/1.', true)
let cookies = reply.text.split('\r\n').filter(line => /^set-cookie:/i.test(line))
if (cookies.length < 2 || !cookies.every(c => /samesite=lax/i.test(c))) {
    console.log(reply.text)
}
ttrue(cookies.length >= 2)
ttrue(cookies.every(c => /samesite=lax/i.test(c)))
ttrue(cookies.every(c => /httponly/i.test(c)))
