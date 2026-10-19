/*
    header-numbers.tst.ts - Numeric request fields are read to their grammar or deliberately clamped
 */

import {ttrue} from '@embedthis/testme'
import {HTTP} from './raw'
import {exchange} from './wire'

const PORT = HTTP.port || 4100
const BAD = ['5abc', '+5', '0x10', '99999999999999999999', ' 5x']

function status(text: string): string {
    return text.split('\r\n')[0]
}

for (let value of BAD) {
    for (let spec of [`${value}-9`, `0-${value}`, `-${value}`]) {
        let reply = await exchange(PORT, `GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=${spec}\r\n` +
            'Connection: close\r\n\r\n')
        let line = status(reply.text)
        if (!line.includes('416') && !line.includes('400')) {
            console.log(`Range: bytes=${spec} was answered "${line}"`)
        }
        ttrue(line.includes('416') || line.includes('400'))
    }
}

let ok = await exchange(PORT,
    'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=0-4\r\nConnection: close\r\n\r\n')
ttrue(status(ok.text).includes('206'))

for (let value of BAD) {
    let body = 'abcde'
    let reply = await exchange(PORT, `PUT /tmp/header-numbers.txt HTTP/1.1\r\nHost: 127.0.0.1\r\n` +
        `Content-Range: bytes ${value}-4/5\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`)
    let line = status(reply.text)
    if (!line.includes('400') && !line.includes('416')) {
        console.log(`Content-Range: bytes ${value}-4/5 was answered "${line}"`)
    }
    ttrue(line.includes('400') || line.includes('416'))
}

for (let value of BAD) {
    let reply = await exchange(PORT, `GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nKeep-Alive: max=${value}\r\n` +
        'Connection: close\r\n\r\n')
    ttrue(status(reply.text).includes('200'))
}
