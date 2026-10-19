/*
    wire.ts - Write exact bytes to a server on any port and collect the reply
 */

import net from 'node:net'

export interface Exchange {
    //  Everything the server sent
    text: string
    //  The server closed the connection before the timeout
    closed: boolean
    //  Milliseconds until the close, or until the timeout
    elapsed: number
}

/*
    Read until close, timeout, or the optional marker.
 */
export async function exchange(port: number, request: string | Buffer, timeout = 5000, marker = ''): Promise<Exchange> {
    let started = Date.now()
    return await new Promise<Exchange>(resolvePromise => {
        let socket = net.connect(port, '127.0.0.1')
        let reply: Exchange = {text: '', closed: false, elapsed: 0}
        let done = false
        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                reply.elapsed = Date.now() - started
                socket.destroy()
                resolvePromise(reply)
            }
        }
        let timer = setTimeout(finish, timeout)
        socket.on('connect', () => socket.write(request))
        socket.on('data', chunk => {
            reply.text += chunk.toString('latin1')
            if (marker && reply.text.includes(marker)) {
                finish()
            }
        })
        socket.on('close', () => {
            reply.closed = true
            finish()
        })
        socket.on('error', () => {})
    })
}

export function status(reply: Exchange): string {
    return reply.text.startsWith('HTTP/') ? reply.text.split('\r\n')[0] : ''
}

export function body(reply: Exchange): string {
    let end = reply.text.indexOf('\r\n\r\n')
    return end < 0 ? '' : reply.text.slice(end + 4)
}
