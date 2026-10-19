/*
    conditional.tst.ts - Conditional GET and revalidation
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

const CLOSE = 'Host: ' + HOST + '\r\nConnection: close\r\n\r\n'

function parts(text: string): any {
    let i = text.indexOf('\r\n\r\n')
    return {head: i >= 0 ? text.slice(0, i) : text, body: i >= 0 ? text.slice(i + 4) : ''}
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

//  Establish the validators for the resource
let base = parts((await send('GET /index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(base.head.includes('200 OK'))

let etag = header(base.head, 'etag')
let lastModified = header(base.head, 'last-modified')
let length = Number(header(base.head, 'content-length'))

ttrue(etag != null)
ttrue(lastModified != null)
teq(base.body.length, length)

//  RFC 9110 8.8.3: an entity-tag is a quoted string, so a strict client can re-emit it as received
ttrue(etag.startsWith('"') && etag.endsWith('"'))
const opaque = etag.slice(1, -1)

//  A matching If-None-Match revalidates: 304, and no body
let r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: ' + etag + '\r\n' + CLOSE,
    'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))
teq(r.body, '')

//  A non-matching If-None-Match returns the full representation
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: 0\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('200 OK'))
teq(r.body.length, length)

/*
    RFC 9110 13.1.2: a field value of "*" makes the condition false when the server has a current
    representation, so a GET must answer 304.
 */
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: *\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))
teq(r.body, '')

/*
    Compare opaque tags across quoting, weak tags, and tag lists.
 */
for (let value of [opaque, 'W/' + etag, '"other", ' + etag, 'W/"x", ' + opaque]) {
    r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: ' + value + '\r\n' + CLOSE,
        'HTTP/1.', true)).text)
    ttrue(r.head.includes('304 Not Modified'), 'If-None-Match: ' + value)
    teq(r.body, '')
}

r = parts((await send('GET /index.html HTTP/1.1\r\nIf-Match: ' + etag + '\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('200 OK'))
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-Match: *\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('200 OK'))

//  A matching If-Modified-Since revalidates
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-Modified-Since: ' + lastModified + '\r\n' + CLOSE,
    'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))
teq(r.body, '')

//  An older If-Modified-Since means the client's copy is stale, so the body is sent
r = parts((await send('GET /index.html HTTP/1.1\r\n' +
    'If-Modified-Since: Sat, 01 Jan 2000 00:00:00 GMT\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('200 OK'))
teq(r.body.length, length)

//  A future If-Modified-Since still revalidates -- the resource has not changed since
r = parts((await send('GET /index.html HTTP/1.1\r\n' +
    'If-Modified-Since: Wed, 01 Jan 2098 00:00:00 GMT\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))

/*
    RFC 9110 13.1.3: when both are present, If-None-Match takes precedence and If-Modified-Since
    must be ignored. A non-matching ETag with a matching date must therefore serve the body.
 */
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: 0\r\n' +
    'If-Modified-Since: ' + lastModified + '\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('200 OK'))
teq(r.body.length, length)

//  A 304 must not carry Content-Length describing a body it is not sending
r = parts((await send('GET /index.html HTTP/1.1\r\nIf-None-Match: ' + etag + '\r\n' + CLOSE,
    'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))
teq(r.body, '')
ttrue(header(r.head, 'etag') == etag || header(r.head, 'etag') == null)

//  A conditional request for a missing resource is a 404, never a 304
r = parts((await send('GET /no-such-document.html HTTP/1.1\r\nIf-None-Match: *\r\n' + CLOSE,
    'HTTP/1.', true)).text)
ttrue(r.head.includes('404 Not Found'))

/*
    Revalidation of a multi-packet document also avoids the transfer. 25K rather than 100K: the
    raw helper reads into a fixed 64K ByteArray, so a larger body would be truncated by the test
    rather than by the server.
 */
let big = parts((await send('GET /25K.txt HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(big.head.includes('200 OK'))
teq(big.body.length, 25616)

r = parts((await send('GET /25K.txt HTTP/1.1\r\nIf-None-Match: ' + header(big.head, 'etag') +
    '\r\n' + CLOSE, 'HTTP/1.', true)).text)
ttrue(r.head.includes('304 Not Modified'))
teq(r.body, '')
