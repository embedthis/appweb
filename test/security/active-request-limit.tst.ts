/*
    active-request-limit.tst.ts - rejected requests must not leak the active-request monitor counter

    The shared test server intentionally sets LimitRequestsPerClient high, so this test starts an isolated
    server with a limit of 1. One incomplete bodied request holds the counter, a second request is rejected,
    then closing the holder must return the counter to zero so the next request succeeds.
 */

import {ttrue, tskip} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, withServer} from './server'

const PORT = 4533
const HOST = `127.0.0.1:${PORT}`

interface Holder {
    socket: net.Socket
    //  Set when the server answered or closed the holder: it was refused rather than held
    lost: boolean
}

async function openPartialRequest(): Promise<Holder> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let holder: Holder = {socket, lost: false}
        socket.on('data', () => holder.lost = true)
        socket.on('close', () => holder.lost = true)
        socket.on('connect', () => {
            //  Resolve once the bytes are away, so what the caller waits on next is the server
            //  counting the request rather than this side sending it
            socket.write(`POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 10\r\n\r\n12345`,
                         () => resolvePromise(holder))
        })
        socket.on('error', reject)
    })
}

async function request(): Promise<string> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let response = ''
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(response)
        }, 2000)

        socket.on('connect', () => {
            socket.write(`GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`)
        })
        socket.on('data', chunk => {
            response += chunk.toString()
        })
        socket.on('close', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
        socket.on('error', reject)
    })
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    let limits = ['LimitRequestsPerClient 1', 'RequestParseTimeout 10secs', 'RequestTimeout 10secs']
    await withServer('active-request-limit', PORT, limits, async () => {
        let holder: Holder | null = await openPartialRequest()
        try {
            /*
                The holder counts as an active request once the server has parsed its headers, which is
                after the write above returns -- so a second request issued immediately can arrive first.
                It is then either served and gone before the counter reaches the limit, or counted first,
                in which case the holder is the request refused. Poll until the server reflects the holder,
                replacing a holder that was refused; a limit that never engages still fails here.
             */
            let refused = ''
            for (let i = 0; i < 20 && !refused.includes('503 Service Unavailable'); i++) {
                if (holder.lost) {
                    holder.socket.destroy()
                    holder = await openPartialRequest()
                }
                refused = await request()
                if (!refused.includes('503 Service Unavailable')) {
                    await Bun.sleep(100)
                }
            }
            if (!refused.includes('503 Service Unavailable')) {
                console.log('Expected concurrent request to be refused, got:\n' + refused)
            }
            ttrue(refused.includes('503 Service Unavailable'))

            holder.socket.destroy()
            holder = null
            await Bun.sleep(500)

            let recovered = await request()
            if (!recovered.includes('200 OK')) {
                console.log('Expected request to recover after holder closed, got:\n' + recovered)
            }
            ttrue(recovered.includes('200 OK'))
        } finally {
            holder?.socket.destroy()
        }
    })
}
