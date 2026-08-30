/*
    http2-rapid-reset.tst.ts - HTTP/2 rapid stream reset churn is bounded
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'

const TESTDIR = resolve(import.meta.dir, '..')
const BIN = resolve(TESTDIR, '../build/bin/appweb')
const PORT = 4514
const HOST = `127.0.0.1:${PORT}`
const WORK = resolve(TESTDIR, 'tmp/http2-rapid-reset')
const CONF = resolve(WORK, 'appweb.conf')
const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
const CANCEL = 8
const ENHANCE_YOUR_CALM = 0xb

interface H2Result {
    closed: boolean
    data: string
    goaway: number
    reset: number
}

function frame(type: number, flags: number, stream: number, payload: Buffer): Buffer {
    let header = Buffer.alloc(9)
    header.writeUIntBE(payload.length, 0, 3)
    header[3] = type
    header[4] = flags
    header.writeUInt32BE(stream & 0x7fffffff, 5)
    return Buffer.concat([header, payload])
}

function hpackString(value: string): Buffer {
    let bytes = Buffer.from(value)
    ttrue(bytes.length < 128)
    return Buffer.concat([Buffer.from([bytes.length]), bytes])
}

function literalIndexedName(index: number, value: string): Buffer {
    ttrue(index > 0 && index < 16)
    return Buffer.concat([Buffer.from([index]), hpackString(value)])
}

function requestBlock(path: string): Buffer {
    return Buffer.concat([
        Buffer.from([0x82]),             // :method GET
        Buffer.from([0x86]),             // :scheme http
        literalIndexedName(4, path),     // :path
        literalIndexedName(1, HOST),     // :authority
    ])
}

function resetPayload(error: number): Buffer {
    let payload = Buffer.alloc(4)
    payload.writeUInt32BE(error)
    return payload
}

function resetPair(streamID: number): Buffer {
    return Buffer.concat([
        frame(1, 0x4, streamID, requestBlock('/index.html')),
        frame(3, 0, streamID, resetPayload(CANCEL)),
    ])
}

async function sendRapidReset(pairs: number, timeout = 2000): Promise<H2Result> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: H2Result = {closed: false, data: '', goaway: 0, reset: 0}
        let frames: Buffer[] = [Buffer.from(PREFACE), frame(4, 0, 0, Buffer.alloc(0))]
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(result)
        }, timeout)

        for (let i = 0; i < pairs; i++) {
            frames.push(resetPair((i * 2) + 1))
        }
        socket.on('connect', () => {
            socket.write(Buffer.concat(frames))
        })
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
            while (pending.length >= 9) {
                let length = pending.readUIntBE(0, 3)
                if (pending.length < 9 + length) {
                    break
                }
                let type = pending[3]
                let payload = pending.subarray(9, 9 + length)
                pending = pending.subarray(9 + length)
                if (type == 0) {
                    result.data += payload.toString()
                } else if (type == 3 && payload.length >= 4) {
                    result.reset = payload.readUInt32BE(0)
                } else if (type == 7 && payload.length >= 8) {
                    result.goaway = payload.readUInt32BE(4)
                }
            }
            if (result.goaway) {
                clearTimeout(timer)
                socket.end()
            }
        })
        socket.on('close', () => {
            clearTimeout(timer)
            result.closed = true
            resolvePromise(result)
        })
        socket.on('error', reject)
    })
}

async function waitForServer(): Promise<boolean> {
    for (let i = 0; i < 40; i++) {
        try {
            let response = await fetch(`http://${HOST}/index.html`, {signal: AbortSignal.timeout(500)})
            if (response.status > 0) {
                return true
            }
        } catch {
        }
        await Bun.sleep(250)
    }
    return false
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(WORK, {recursive: true, force: true})
    mkdirSync(WORK, {recursive: true})
    writeFileSync(CONF, [
        `ErrorLog ${WORK}/error.log level=4`,
        `TraceLog ${WORK}/trace.log level=2`,
        `Http2 on`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `AddHandler fileHandler html txt ""`,
        `LimitWorkers 2`,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', CONF], {stdout: 'ignore', stderr: 'pipe'})
    try {
        if (!await waitForServer()) {
            server.kill('SIGKILL')
            let error = ''
            if (server.stderr) {
                error = await new Response(server.stderr).text()
            }
            console.log('server did not start: ' + error)
            for (let log of [resolve(WORK, 'error.log'), resolve(WORK, 'trace.log')]) {
                if (existsSync(log)) {
                    console.log(log + ':\n' + readFileSync(log, 'utf8'))
                }
            }
            ttrue(false)
        }

        let control = await sendRapidReset(2, 500)
        if (control.goaway != 0) {
            console.log('control reset expected no GOAWAY but got ' + JSON.stringify(control))
        }
        teq(control.goaway, 0)

        let rapid = await sendRapidReset(128)
        if (rapid.goaway != ENHANCE_YOUR_CALM) {
            console.log('rapid reset expected ENHANCE_YOUR_CALM but got ' + JSON.stringify(rapid))
        }
        teq(rapid.goaway, ENHANCE_YOUR_CALM)
        ttrue(rapid.closed)
    } finally {
        server.kill('SIGKILL')
        rmSync(WORK, {recursive: true, force: true})
    }
}
