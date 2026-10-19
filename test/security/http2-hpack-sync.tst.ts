/*
    http2-hpack-sync.tst.ts - A refused HTTP/2 header block never leaves the HPACK table out of step
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, withServer} from './server'
import {END_HEADERS, END_STREAM, PREFACE, frame, hpackString, literal, requestBlock} from './h2'

const PORT = 4583
const HOST = `127.0.0.1:${PORT}`
const COMPRESSION_ERROR = 0x9
const PRIORITY = 0x20

interface Exchange {
    goaway: number
    reset: Map<number, number>
    ended: Set<number>
}

//  Literal field with incremental indexing, new name: the peer adds it to the dynamic table at index 62
function indexed(name: string, value: string): Buffer {
    return Buffer.concat([Buffer.from([0x40]), hpackString(name), hpackString(value)])
}

async function exchange(frames: Buffer[], last: number, timeout = 3000): Promise<Exchange> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: Exchange = {goaway: -1, reset: new Map(), ended: new Set()}
        let finish = () => {
            clearTimeout(timer)
            socket.destroy()
            resolvePromise(result)
        }
        let timer = setTimeout(finish, timeout)
        socket.on('connect', () => {
            socket.write(Buffer.concat([Buffer.from(PREFACE), frame(4, 0, 0, Buffer.alloc(0)), ...frames]))
        })
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
            while (pending.length >= 9) {
                let length = pending.readUIntBE(0, 3)
                if (pending.length < 9 + length) {
                    break
                }
                let type = pending[3], flags = pending[4], id = pending.readUInt32BE(5) & 0x7fffffff
                let payload = pending.subarray(9, 9 + length)
                pending = pending.subarray(9 + length)
                if (type <= 1 && (flags & END_STREAM)) {
                    result.ended.add(id)
                } else if (type == 3) {
                    result.reset.set(id, payload.readUInt32BE(0))
                } else if (type == 7) {
                    result.goaway = payload.readUInt32BE(4)
                }
            }
            if (result.goaway >= 0 || result.ended.has(last)) {
                finish()
            }
        })
        socket.on('error', reject)
    })
}

function headers(id: number, block: Buffer, flags = 0): Buffer {
    return frame(1, END_HEADERS | END_STREAM | flags, id, block)
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('http2-hpack-sync', PORT, ['LimitRequestHeader 600', 'LimitUri 100'], async () => {
        /*
            Reference an entry added after a refused field to verify HPACK decoding stays synchronized.
         */
        let rejected = await exchange([
            headers(1, requestBlock('/' + 'a'.repeat(200), HOST, [indexed('x-probe', 'one')])),
            headers(3, requestBlock('/index.html', HOST, [Buffer.from([0xbe])])),
        ], 3)
        if (rejected.goaway >= 0 || !rejected.ended.has(3)) {
            console.log('after a rejected field: goaway ' + rejected.goaway + ', ended ' + [...rejected.ended])
        }
        ttrue(rejected.ended.has(1) || rejected.reset.has(1))
        teq(rejected.goaway, -1)
        ttrue(rejected.ended.has(3))

        let priority = Buffer.concat([Buffer.from([0, 0, 0, 1, 15]), requestBlock('/index.html', HOST,
            [indexed('x-probe', 'two')])])
        let dependent = await exchange([headers(1, priority, PRIORITY)], 1)
        teq(dependent.goaway, COMPRESSION_ERROR)

        let big = await exchange([headers(1, requestBlock('/index.html', HOST,
            [indexed('x-probe', 'three'), literal('x-pad', 'p'.repeat(800))]))], 1)
        teq(big.goaway, COMPRESSION_ERROR)
    })
}
