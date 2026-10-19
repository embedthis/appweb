/*
    Only a complete decimal Sec-WebSocket-Version value of 13 may open a connection. Unsupported versions must
    advertise 13.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, TESTDIR, withServer} from './server'

const PORT = 6286

async function upgrade(version: string): Promise<string> {
    let request = [
        'GET /ws/index.html HTTP/1.1',
        `Host: 127.0.0.1:${PORT}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        `Sec-WebSocket-Version: ${version}`,
        '',
        '',
    ].join('\r\n')
    return await new Promise<string>(resolvePromise => {
        let socket = net.connect(PORT, '127.0.0.1')
        let text = ''
        let finish = () => {
            clearTimeout(timer)
            socket.destroy()
            resolvePromise(text.split('\r\n')[0])
        }
        let timer = setTimeout(finish, 3000)
        socket.on('connect', () => socket.write(request))
        socket.on('data', chunk => {
            text += chunk.toString('latin1')
            if (text.includes('\r\n')) {
                finish()
            }
        })
        socket.on('close', finish)
        socket.on('error', finish)
    })
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('websocket-version', PORT, [
        '<Route ^/ws/>',
        '    Prefix /ws',
        `    Documents ${TESTDIR}/web`,
        '    AddFilter webSocketFilter',
        '    SetHandler fileHandler',
        '</Route>',
    ], async () => {
        let ok = await upgrade('13')
        ttrue(/ 101 /.test(ok), 'version 13 upgrades: ' + ok)

        for (let version of ['4294967309', '14', '13abc', '-13']) {
            let status = await upgrade(version)
            ttrue(!/ 101 /.test(status), `version ${version} refused: ${status}`)
        }
    })
}
