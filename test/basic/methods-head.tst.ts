/*
    methods-head.tst.ts - HEAD
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

//  Split a reply into its header block and whatever followed it
function parts(text: string): any {
    let i = text.indexOf('\r\n\r\n')
    return {
        head: i >= 0 ? text.slice(0, i) : text,
        body: i >= 0 ? text.slice(i + 4) : '',
    }
}

function header(head: string, name: string): string | null {
    for (let line of head.split('\r\n')) {
        let colon = line.indexOf(':')
        if (colon > 0 && line.slice(0, colon).trim().toLowerCase() == name) {
            return line.slice(colon + 1).trim()
        }
    }
    return null
}

const CLOSE = 'Host: ' + HOST + '\r\nConnection: close\r\n\r\n'

//  A HEAD on a static document: 200, no body at all
let reply = await send('HEAD /index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
let head = parts(reply.text)
ttrue(head.head.includes('200 OK'))
teq(head.body, '')

//  The Content-Length is the length the body would have had, not zero
let len = header(head.head, 'content-length')
ttrue(len != null)
ttrue(Number(len) > 0)

//  The same resource by GET: same status, same Content-Length, and a body of exactly that length
let g = parts((await send('GET /index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(g.head.includes('200 OK'))
teq(header(g.head, 'content-length'), len)
teq(g.body.length, Number(len))

//  HEAD and GET agree on the representation metadata
teq(header(head.head, 'content-type'), header(g.head, 'content-type'))
teq(header(head.head, 'etag'), header(g.head, 'etag'))
teq(header(head.head, 'last-modified'), header(g.head, 'last-modified'))

/*
    HEAD errors describe the GET body length but send no body.
 */
reply = await send('HEAD /no-such-document.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
head = parts(reply.text)
ttrue(head.head.includes('404 Not Found'))
ttrue(Number(header(head.head, 'content-length')) > 0)
teq(head.body, '')

//  HEAD on the directory handler is likewise body-free
reply = await send('HEAD /dir/ HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
head = parts(reply.text)
ttrue(head.head.includes('HTTP/1.1'))
teq(head.body, '')

//  HEAD on a large document must not stream 100K of body
reply = await send('HEAD /100K.txt HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
head = parts(reply.text)
ttrue(head.head.includes('200 OK'))
teq(header(head.head, 'content-length'), '102516')
teq(head.body, '')
