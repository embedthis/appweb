/*
    request-line.tst.ts - Request line grammar and the empty-line prologue
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, reject, send, responses} from './raw'

const TAIL = 'Host: ' + HOST + '\r\nConnection: close\r\n\r\n'

let base = (await send('GET /index.html HTTP/1.1\r\n' + TAIL, 'Hello /index.html', true)).text
ttrue(base.includes('200 OK'))
for (let prologue of ['\r\n', '\r\n\r\n', '\r\n\r\n\r\n\r\n', '\n', '\r', '\n\n']) {
    let reply = await send(prologue + 'GET /index.html HTTP/1.1\r\n' + TAIL, 'Hello /index.html', true)
    if (!reply.text.includes('200 OK')) {
        console.log('prologue ' + JSON.stringify(prologue) + ' got:\n' + reply.text)
    }
    ttrue(reply.text.includes('200 OK'))
    teq(reply.text.split('\r\n\r\n')[1], base.split('\r\n\r\n')[1])
}

let garbage = await send('ZZZZ\r\n\r\n', 'HTTP/1.', true)
teq(responses(garbage.text), 0)
ttrue(garbage.closed)

for (let line of ['GET\t/index.html\tHTTP/1.1', 'GET  /index.html  HTTP/1.1', 'GET /index.html\tHTTP/1.1',
                  '\tGET /index.html HTTP/1.1', ' GET /index.html HTTP/1.1', 'GET /index.html  HTTP/1.1',
                  'GET  /index.html HTTP/1.1', 'GET /index.html HTTP/1.1 ']) {
    await reject(JSON.stringify(line), line + '\r\n' + TAIL, '400 Bad Request')
}

await reject('method with a non-token character', 'GE(T /index.html HTTP/1.1\r\n' + TAIL, '400 Bad Request')
await reject('method with a slash', 'GE/T /index.html HTTP/1.1\r\n' + TAIL, '400 Bad Request')
await reject('64 character method', 'M'.repeat(64) + ' /index.html HTTP/1.1\r\n' + TAIL, '400 Bad Request')

for (let line of ['GET /index.html HTTP/1.1', 'GET /index.html HTTP/1.0']) {
    let reply = await send(line + '\r\n' + TAIL, 'Hello /index.html', true)
    ttrue(reply.text.includes('200 OK'), line)
}
let custom = await send('PURGE /index.html HTTP/1.1\r\n' + TAIL, 'HTTP/1.', true)
teq(responses(custom.text), 1)
ttrue(!custom.text.includes('400 Bad Request'))
