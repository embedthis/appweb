/*
    accept-limit.tst.ts - LimitConnections also bounds accepted sockets
 */

import {ttrue} from '@embedthis/testme'
import net from 'node:net'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'

const PORT = 4598

function open(): Promise<net.Socket> {
    return new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1', () => resolvePromise(socket))
        socket.on('error', reject)
    })
}

await withServer('accept-limit', PORT, ['LimitConnections 2', 'LimitConnectionsPerClient 100'], async () => {
    let held = [await open(), await open()]
    await Bun.sleep(200)
    let extra = await open()
    let closed = await new Promise<boolean>(resolvePromise => {
        extra.on('close', () => resolvePromise(true))
        setTimeout(() => resolvePromise(false), 3000)
    })
    ttrue(closed)
    let log = resolve(workDir('accept-limit'), 'error.log')
    let text = existsSync(log) ? readFileSync(log, 'utf8') : ''
    if (!text.includes('Socket layer rejecting connection')) {
        console.log(text)
    }
    ttrue(text.includes('Socket layer rejecting connection'))
    for (let socket of held) {
        socket.destroy()
    }
})
