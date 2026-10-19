/*
    origin.tst.ts - The WebSocket handshake admits only permitted origins
 */

import {teq, tget, tinfo} from '@embedthis/testme'
import {connect} from 'node:net'

const PORT = Number(tget('TM_HTTP_PORT') || '4100')
const HOST = `127.0.0.1:${PORT}`

//  Status of the handshake response: 101 when upgraded
function handshake(path: string, origin: string | null): Promise<number> {
    return new Promise((resolve, reject) => {
        let socket = connect(PORT, '127.0.0.1', () => {
            socket.write(`GET ${path} HTTP/1.1\r\nHost: ${HOST}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
                'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n' +
                (origin ? `Origin: ${origin}\r\n` : '') + '\r\n')
        })
        let response = ''
        socket.setTimeout(5000, () => {
            socket.destroy()
            reject(new Error(`no handshake response from ${path}`))
        })
        socket.on('data', (data) => {
            response += data.toString('latin1')
            let match = response.match(/^HTTP\/1\.1 (\d{3})/)
            if (match) {
                socket.destroy()
                resolve(Number(match[1]))
            }
        })
        socket.on('error', reject)
    })
}

//  Default: the request's own origin only
teq(await handshake('/ws/echo', `http://${HOST}`), 101, 'same origin must upgrade')
teq(await handshake('/ws/echo', null), 101, 'a handshake without Origin must upgrade')
teq(await handshake('/ws/echo', 'https://other.example'), 403, 'a foreign origin must be refused')
teq(await handshake('/ws/echo', `https://${HOST}`), 403, 'another scheme is another origin')

//  A listed origin, and nothing else
teq(await handshake('/wsorigin-list', 'https://a.example'), 101, 'a listed origin must upgrade')
teq(await handshake('/wsorigin-list', 'https://b.example'), 403, 'an unlisted origin must be refused')
teq(await handshake('/wsorigin-list', `http://${HOST}`), 403, 'a list replaces the same-origin default')

//  Any origin
teq(await handshake('/wsorigin-any', 'https://b.example'), 101, '"*" must admit any origin')

//  A proxied upgrade is checked by the backend's own filter against the Host the proxy forwards
if (process.platform == 'win32') {
    tinfo('proxy cases skipped: the proxy handler is not built on Windows')
} else {
    teq(await handshake('/proxy/ws/echo', `http://${HOST}`), 101, 'same origin must upgrade through the proxy')
    teq(await handshake('/proxy/ws/echo', 'https://other.example'), 403,
        'a foreign origin must be refused by the backend')
}
