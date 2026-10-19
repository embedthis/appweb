/*
    h2-content-length.tst.ts - A CGI program sees CONTENT_LENGTH over HTTP/2 as it does over HTTP/1
 */

import {ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'
import {literal, literalIndexedName, requestBlock, sendH2} from '../security/h2'
import {dechunk} from '../security/raw'
import {exchange} from '../security/wire'

const PORT = 4565
const CGI = '/cgiProgram.cgi?switches=-e%20-p'
const BODY = 'name=value&other=12345'

function variable(text: string, name: string): string {
    let match = new RegExp('<P>' + name + '=([^<]*)</P>').exec(text)
    return match ? match[1] : ''
}

await withServer('h2-content-length', PORT, ['AddHandler cgiHandler cgi'], async () => {
    let h1 = await exchange(PORT, `POST ${CGI} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\n` +
        `Content-Length: ${BODY.length}\r\nConnection: close\r\n\r\n${BODY}`)
    let h1Length = variable(dechunk(h1.text), 'CONTENT_LENGTH')
    ttrue(h1Length == String(BODY.length))

    //  The same POST over HTTP/2: :method is the static entry 2 given a literal value
    let block = Buffer.concat([
        literalIndexedName(2, 'POST'),
        requestBlock(CGI, `127.0.0.1:${PORT}`, [literal('content-length', String(BODY.length)),
            literal('content-type', 'text/plain')]).subarray(1),
    ])
    let h2 = await sendH2(PORT, block, 5000, Buffer.from(BODY))
    let h2Length = variable(h2.data, 'CONTENT_LENGTH')
    if (h2Length != h1Length) {
        console.log(`CONTENT_LENGTH over HTTP/2 "${h2Length}", over HTTP/1 "${h1Length}"`)
    }
    ttrue(h2Length == h1Length)
    ttrue(h2.data.includes(`Post Data ${BODY.length} bytes found`))

    //  A chunked HTTP/1 body is received before the gateway starts: CONTENT_LENGTH is its decoded size
    let half = BODY.length >> 1
    let chunked = await exchange(PORT, `POST ${CGI} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\n` +
        `Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n` +
        `${half.toString(16)}\r\n${BODY.slice(0, half)}\r\n` +
        `${(BODY.length - half).toString(16)}\r\n${BODY.slice(half)}\r\n0\r\n\r\n`)
    let text = dechunk(chunked.text)
    ttrue(variable(text, 'CONTENT_LENGTH') == String(BODY.length))
    ttrue(text.includes(`Post Data ${BODY.length} bytes found`))

    //  The hop-by-hop framing header is not exported to the gateway
    ttrue(!text.includes('HTTP_TRANSFER_ENCODING'))

    //  An HTTP/2 POST with no content-length is likewise given the decoded size
    let undeclared = Buffer.concat([
        literalIndexedName(2, 'POST'),
        requestBlock(CGI, `127.0.0.1:${PORT}`, [literal('content-type', 'text/plain')]).subarray(1),
    ])
    let h2Undeclared = await sendH2(PORT, undeclared, 5000, Buffer.from(BODY))
    ttrue(variable(h2Undeclared.data, 'CONTENT_LENGTH') == String(BODY.length))
    ttrue(h2Undeclared.data.includes(`Post Data ${BODY.length} bytes found`))
})
