/*
    template-overrun.tst.ts - Header values ending in an unfinished ${ token
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

for (let origin of ['${', 'http://a.example/${', '$', 'http://a.example/${name', '${}${']) {
    for (let path of ['/cors-client', '/cors-all', '/cors-token']) {
        let request = `GET ${path} HTTP/1.1\r\nHost: ${HOST}\r\nOrigin: ${origin}\r\nConnection: close\r\n\r\n`
        let reply = await send(request, 'cors', true)
        if (!reply.text.includes('200 OK') || !reply.decoded.includes('cors')) {
            console.log('Origin: ' + origin + ' on ' + path + ' got:\n' + reply.text)
        }
        ttrue(reply.text.includes('200 OK'))
        ttrue(reply.decoded.includes('cors'))
    }
}
