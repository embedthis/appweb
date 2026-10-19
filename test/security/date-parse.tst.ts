/*
    date-parse.tst.ts - Truncated dates in If-Modified-Since
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

function get(since: string): string {
    return `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nIf-Modified-Since: ${since}\r\nConnection: close\r\n\r\n`
}

function status(text: string): string {
    return text.split('\r\n')[0]
}

for (let since of ['1/', '12/', '1-', '1.']) {
    let first = await send(get(since), 'HTTP/1.', true)
    let second = await send(get(since), 'HTTP/1.', true)
    ttrue(first.text.includes('200 OK'))
    teq(status(first.text), status(second.text))
    ttrue(first.decoded.includes('Hello /index.html'))
}

let future = await send(get('Sun, 06 Nov 2094 08:49:37 GMT'), 'HTTP/1.', true)
ttrue(future.text.includes('304 Not Modified'))
