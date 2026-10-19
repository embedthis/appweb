/*
    Hold client bytes until the backend accepts the upgrade with 101. An accepted tunnel must forward bytes buffered
    before and sent after the response.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {Config} from '@embedthis/ejscript'
import {BACKEND, exchange} from './proxy'

if (Config.OS == 'windows') {
    tskip('the proxy handler is not built on Windows, so the /badproxy/ route does not exist')
    process.exit(0)
}

const UPGRADE = 'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
    'Sec-WebSocket-Version: 13\r\n'


function startBackend(received: string[]) {
    return Bun.listen({
        hostname: '127.0.0.1',
        port: BACKEND,
        socket: {
            open(socket: any) {
                socket.data = {buf: '', upgraded: false}
            },
            data(socket: any, data: Buffer) {
                let text = data.toString('latin1')
                received.push(text)
                let state = socket.data
                if (state.upgraded) {
                    return
                }
                state.buf += text
                let end = state.buf.indexOf('\r\n\r\n')
                if (end < 0) {
                    return
                }
                if (state.buf.split(' ')[1].includes('ws')) {
                    state.upgraded = true
                    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
                        'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n')
                } else {
                    socket.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
                }
                state.buf = ''
            },
        },
    })
}

{
    let received: string[] = []
    let server = startBackend(received)
    try {
        let response = await exchange(`GET /badproxy/plain HTTP/1.1\r\nHost: t\r\n${UPGRADE}\r\n` +
            'GET /not-routed HTTP/1.1\r\nHost: t\r\n\r\n')
        let seen = received.join('')
        if (seen.includes('/not-routed')) {
            console.log('backend received a request the front never routed: ' + JSON.stringify(seen))
        }
        ttrue(seen.includes('GET /plain HTTP/1.1'))
        ttrue(!seen.includes('/not-routed'))
        ttrue(response.startsWith('HTTP/1.1 200'))
    } finally {
        server.stop(true)
        await Bun.sleep(250)
    }
}

{
    let received: string[] = []
    let server = startBackend(received)
    try {
        let response = await exchange(`GET /badproxy/ws HTTP/1.1\r\nHost: t\r\n${UPGRADE}\r\nEARLY`,
            '101 Switching', 'LATER')
        let seen = received.join('')
        if (!seen.endsWith('EARLYLATER')) {
            console.log('tunnel response: ' + JSON.stringify(response) + ' backend: ' + JSON.stringify(seen))
        }
        ttrue(response.startsWith('HTTP/1.1 101'))
        ttrue(seen.endsWith('\r\n\r\nEARLYLATER'))
    } finally {
        server.stop(true)
        await Bun.sleep(250)
    }
}
