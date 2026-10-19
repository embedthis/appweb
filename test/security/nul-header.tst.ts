/*
    nul-header.tst.ts - A NUL in the request line or header block is refused, never held
 */

import {ttrue} from '@embedthis/testme'
import {exchange, status} from './wire'
import {HTTP} from './raw'

const PORT = HTTP.port || 4100

async function refused(name: string, request: string): Promise<void> {
    let reply = await exchange(PORT, Buffer.from(request, 'latin1'), 5000)
    let ok = status(reply).includes('400 Bad Request') && reply.closed && reply.elapsed < 3000
    if (!ok) {
        console.log(`${name}: expected a prompt 400 and close, got "${status(reply)}" closed=${reply.closed} ` +
            `after ${reply.elapsed}ms`)
    }
    ttrue(ok)
}

await refused('field name', 'GET /index.html HTTP/1.1\r\nHo\0st: localhost\r\nConnection: close\r\n\r\n')
await refused('field value', 'GET /index.html HTTP/1.1\r\nHost: local\0host\r\nConnection: close\r\n\r\n')
await refused('request target', 'GET /a\0b HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')

await refused('method', 'G\0ET /index.html HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
await refused('version', 'GET /index.html HTTP/1.1\0\r\nHost: localhost\r\nConnection: close\r\n\r\n')

let post = await exchange(PORT, Buffer.from('POST /index.html HTTP/1.1\r\nHost: localhost\r\nContent-Length: 3\r\n' +
    'Connection: close\r\n\r\na\0b', 'latin1'), 5000)
ttrue(!status(post).includes('400'))
ttrue(status(post) != '')
