/*
    content-range.tst.ts - Content-Range request-header grammar ratchet

    A malformed Content-Range request header used to feed uninitialized strtok continuation pointers. These
    requests must be rejected cleanly before routing, and a well formed value must still reach the route.
 */

import {HOST, accept, reject} from './raw'

function get(range: string): string {
    return `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Range: ${range}\r\n\r\n`
}

await reject('Content-Range unit only', get('bytes'), '400 Bad Request')
await reject('Content-Range missing dash', get('bytes x'), '400 Bad Request')
await reject('Content-Range reversed', get('bytes 2-1/3'), '400 Bad Request')

await accept('Content-Range valid', get('bytes 0-1/2'), 'Hello /index.html')
