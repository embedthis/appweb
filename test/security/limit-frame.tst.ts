/*
    limit-frame.tst.ts - LimitFrame sets the HTTP/2 frame size the server advertises and accepts
 */

import {teq, ttrue} from '@embedthis/testme'
import {spawnSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer, workDir} from './server'
import {PREFACE, frame} from './h2'

const PORT = 4568
const FRAME_SIZE_ERROR = 6

interface Result {
    maxFrame: number
    goaway: number
    ping: boolean
}

/*
    Send an unknown frame followed by PING. Accepted frames permit the reply; oversized frames require FRAME_SIZE_ERROR.
 */
async function probe(port: number, size: number): Promise<Result> {
    return await new Promise(done => {
        let socket = net.connect(port, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: Result = {maxFrame: 0, goaway: 0, ping: false}
        let finish = () => {
            clearTimeout(timer)
            socket.destroy()
            done(result)
        }
        let timer = setTimeout(finish, 3000)
        socket.on('connect', () => {
            socket.write(Buffer.concat([
                Buffer.from(PREFACE),
                frame(4, 0, 0, Buffer.alloc(0)),
                frame(0xa, 0, 0, Buffer.alloc(size, 0x61)),
                frame(6, 0, 0, Buffer.from('12345678')),
            ]))
        })
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
            while (pending.length >= 9) {
                let length = pending.readUIntBE(0, 3)
                if (pending.length < 9 + length) {
                    break
                }
                let type = pending[3], flags = pending[4], payload = pending.subarray(9, 9 + length)
                pending = pending.subarray(9 + length)
                if (type == 4 && !(flags & 1)) {
                    for (let i = 0; i + 6 <= payload.length; i += 6) {
                        if (payload.readUInt16BE(i) == 5) {
                            result.maxFrame = payload.readUInt32BE(i + 2)
                        }
                    }
                } else if (type == 6 && (flags & 1)) {
                    result.ping = true
                    finish()
                } else if (type == 7) {
                    result.goaway = payload.readUInt32BE(4)
                    finish()
                }
            }
        })
        socket.on('error', () => {})
        socket.on('close', finish)
    })
}

//  The default: 16384 advertised, and a 20000 byte frame refused
await withServer('limit-frame-default', PORT, [], async () => {
    let r = await probe(PORT, 20000)
    teq(r.maxFrame, 16384)
    teq(r.goaway, FRAME_SIZE_ERROR)
})

//  LimitFrame 32768: advertised, a 20000 byte frame accepted, a 40000 byte frame refused
await withServer('limit-frame-32k', PORT + 1, ['LimitFrame 32768'], async () => {
    let r = await probe(PORT + 1, 20000)
    teq(r.maxFrame, 32768)
    teq(r.goaway, 0)
    ttrue(r.ping)
    let big = await probe(PORT + 1, 40000)
    teq(big.goaway, FRAME_SIZE_ERROR)
})

//  Below the protocol minimum is a configuration error
let work = workDir('limit-frame-small')
mkdirSync(work, {recursive: true})
let conf = resolve(work, 'appweb.conf')
writeFileSync(conf, [`ErrorLog ${work}/error.log level=2`, 'Http2 on', 'Http2Cleartext on', `Listen 127.0.0.1:${PORT + 2}`,
    `Documents ${TESTDIR}/web`, 'LimitFrame 1024', ''].join('\n'))
let run = spawnSync(BIN, ['--config', conf], {timeout: 5000})
ttrue(run.status != 0 && run.status != null)
