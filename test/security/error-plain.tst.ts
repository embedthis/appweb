/*
    error-plain.tst.ts - A plain-text error body is labelled text/plain
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

async function error(accept: string): Promise<{type: string, body: string}> {
    let request = ['GET /no/such/document.html HTTP/1.1', 'Host: ' + HOST, 'Accept: ' + accept,
        'Connection: close', '', ''].join('\r\n')
    let reply = await send(request, 'HTTP/1.1', true)
    ttrue(reply.text.includes('404 Not Found'))
    let type = /\r\nContent-Type: ([^\r]*)\r\n/i.exec(reply.text)
    return {type: type ? type[1] : '', body: reply.text.slice(reply.text.indexOf('\r\n\r\n') + 4)}
}

let plain = await error('text/plain')
ttrue(plain.type.startsWith('text/plain'))
ttrue(plain.body.startsWith('Access Error: 404 -- Not Found'))
ttrue(!plain.body.includes('<'))

let html = await error('text/html')
ttrue(html.type.startsWith('text/html'))
ttrue(html.body.startsWith('<!DOCTYPE html>'))
ttrue(/<pre>[^<]*<\/pre>/.test(html.body))

let list = await error('text/plain, */*')
ttrue(list.type.startsWith('text/html'))
