/*
    limit-websockets.tst.ts - LimitWebSockets caps concurrent WebSocket upgrades.
 */

import {ttrue, tget} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

const HTTP = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
const HOST = HTTP.host
const PATH = '/ws-limit/echo'
const LIMIT = 5

interface Handshake {
    socket: Socket
    text: string
}

function request(index: number): string {
    return 'GET ' + PATH + ' HTTP/1.1\r\n' +
        'Host: ' + HOST + '\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Version: 13\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ' + index + '==\r\n' +
        '\r\n'
}

async function handshake(index: number): Promise<Handshake> {
    let socket = new Socket
    let response = new ByteArray(4096)

    socket.connect(HTTP.address)
    try {
        await socket.write(request(index))
        for (let i = 0; i < 10 && !response.toString().includes('\r\n\r\n'); i++) {
            if ((await socket.read(response, -1)) == null) {
                break
            }
        }
    } catch {
        /* The caller checks the response bytes. */
    }
    return {socket, text: response.toString()}
}

let sockets: Socket[] = []

try {
    for (let i = 0; i < LIMIT; i++) {
        let opened = await handshake(i)
        if (!opened.text.includes('101 Switching Protocols')) {
            console.log('Expected WebSocket ' + i + ' to open, got:\n' + opened.text)
        }
        ttrue(opened.text.includes('101 Switching Protocols'))
        sockets.push(opened.socket)
    }

    let refused = await handshake(99)
    if (!refused.text.includes('503 Service Unavailable')) {
        console.log('Expected the sixth WebSocket to be refused, got:\n' + refused.text)
    }
    ttrue(refused.text.includes('503 Service Unavailable'))
    refused.socket.close()

    sockets.shift()?.close()
    await Bun.sleep(250)

    let reopened = await handshake(100)
    if (!reopened.text.includes('101 Switching Protocols')) {
        console.log('Expected a WebSocket to open after one closed, got:\n' + reopened.text)
    }
    ttrue(reopened.text.includes('101 Switching Protocols'))
    reopened.socket.close()

} finally {
    for (let socket of sockets) {
        socket.close()
    }
}
