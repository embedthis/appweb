/*
    if-range.tst.ts - If-Range decides whether a Range is applied, never whether a 304 is sent
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from './../security/raw'

const PATH = '/index.html'

interface Response {
    status: string
    headers: Record<string, string>
    body: string
}

async function get(extra: string[]): Promise<Response> {
    let request = ['GET ' + PATH + ' HTTP/1.1', 'Host: ' + HOST, 'Connection: close', ...extra, '', ''].join('\r\n')
    let reply = await send(request, 'HTTP/1.1 ', true)
    let end = reply.text.indexOf('\r\n\r\n')
    let lines = reply.text.slice(0, end).split('\r\n')
    let headers: Record<string, string> = {}
    for (let line of lines.slice(1)) {
        let colon = line.indexOf(':')
        headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim()
    }
    return {status: lines[0], headers, body: reply.text.slice(end + 4)}
}

function expect(name: string, response: Response, status: string): void {
    if (!response.status.includes(status)) {
        console.log(name + ': expected ' + status + ' but got ' + response.status)
    }
    ttrue(response.status.includes(status))
}

let current = await get([])
expect('plain GET', current, '200 OK')
let etag = current.headers['etag']
let modified = current.headers['last-modified']
let size = current.body.length
ttrue(etag.startsWith('"') && etag.endsWith('"'))
ttrue(modified != null && modified.endsWith(' GMT'))

let matching = await get(['Range: bytes=0-9', 'If-Range: ' + etag])
expect('matching entity-tag', matching, '206 Partial Content')
teq(matching.body.length, 10)
teq(matching.headers['content-range'], 'bytes 0-9/' + size)

let stale = await get(['Range: bytes=0-9', 'If-Range: "stale"'])
expect('non-matching entity-tag', stale, '200 OK')
teq(stale.body.length, size)
ttrue(stale.headers['content-range'] == null)

let weak = await get(['Range: bytes=0-9', 'If-Range: W/' + etag])
expect('weak entity-tag', weak, '200 OK')
teq(weak.body.length, size)

let sameDate = await get(['Range: bytes=0-9', 'If-Range: ' + modified])
expect('date equal to Last-Modified', sameDate, '206 Partial Content')
teq(sameDate.body.length, 10)

let earlier = await get(['Range: bytes=0-9', 'If-Range: Mon, 01 Jan 2001 00:00:00 GMT'])
expect('earlier date', earlier, '200 OK')
teq(earlier.body.length, size)

let noRange = await get(['If-Range: "stale"'])
expect('If-Range without Range', noRange, '200 OK')
teq(noRange.body.length, size)

let notModified = await get(['Range: bytes=0-9', 'If-Range: "stale"', 'If-None-Match: ' + etag])
expect('If-None-Match still applies', notModified, '304 Not Modified')
