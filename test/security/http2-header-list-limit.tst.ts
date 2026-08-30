/*
    http2-header-list-limit.tst.ts - HTTP/2 decoded header lists are bounded
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, withServer} from './server'

const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
const END_STREAM = 0x1
const END_HEADERS = 0x4
const PROTOCOL_ERROR = 0x1

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

function hpackInt(value: number, prefix: number, first: number): Buffer {
    let mask = (1 << prefix) - 1
    let bytes: number[] = []
    if (value < mask) {
        bytes.push(first | value)
    } else {
        bytes.push(first | mask)
        value -= mask
        while (value >= 128) {
            bytes.push((value % 128) + 128)
            value = Math.floor(value / 128)
        }
        bytes.push(value)
    }
    return Buffer.from(bytes)
}

function hpackString(value: string): Buffer {
    let bytes = Buffer.from(value)
    ttrue(bytes.length < 128)
    return Buffer.concat([Buffer.from([bytes.length]), bytes])
}

function literalIndexedName(index: number, value: string, indexed = false): Buffer {
    return Buffer.concat([
        hpackInt(index, indexed ? 6 : 4, indexed ? 0x40 : 0),
        hpackString(value),
    ])
}

function requestBlock(host: string, cookieValue: string, cookieReplays: number): Buffer {
    let headers = [
        Buffer.from([0x82]),                         // :method GET
        Buffer.from([0x86]),                         // :scheme http
        literalIndexedName(4, '/index.html'),        // :path
        literalIndexedName(1, host),                 // :authority
        literalIndexedName(32, cookieValue, true),   // cookie, inserted at dynamic index 62
    ]
    for (let i = 0; i < cookieReplays; i++) {
        headers.push(Buffer.from([0xbe]))            // indexed dynamic entry 62
    }
    return Buffer.concat(headers)
}

async function sendRequest(port: number, cookieValue: string, cookieReplays: number, timeout = 700): Promise<H2Result> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(port, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: H2Result = {closed: false, data: '', goaway: 0, reset: 0}
        let host = `127.0.0.1:${port}`
        let frames = Buffer.concat([
            Buffer.from(PREFACE),
            frame(4, 0, 0, Buffer.alloc(0)),
            frame(1, END_HEADERS | END_STREAM, 1, requestBlock(host, cookieValue, cookieReplays)),
        ])
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(result)
        }, timeout)

        socket.on('connect', () => {
            socket.write(frames)
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

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('http2-header-count', 4515, [], async () => {
        let control = await sendRequest(4515, 'a=b', 59)
        if (control.goaway != 0) {
            console.log('control expected no GOAWAY but got ' + JSON.stringify(control))
        }
        teq(control.goaway, 0)

        let tooMany = await sendRequest(4515, 'a=b', 60)
        if (tooMany.goaway != PROTOCOL_ERROR) {
            console.log('header count expected PROTOCOL_ERROR but got ' + JSON.stringify(tooMany))
        }
        teq(tooMany.goaway, PROTOCOL_ERROR)
    })

    await withServer('http2-header-size', 4516, ['LimitRequestHeader 384'], async () => {
        let control = await sendRequest(4516, 'a=b', 2)
        if (control.goaway != 0) {
            console.log('small decoded list expected no GOAWAY but got ' + JSON.stringify(control))
        }
        teq(control.goaway, 0)

        let tooLarge = await sendRequest(4516, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 2)
        if (tooLarge.goaway != PROTOCOL_ERROR) {
            console.log('decoded list size expected PROTOCOL_ERROR but got ' + JSON.stringify(tooLarge))
        }
        teq(tooLarge.goaway, PROTOCOL_ERROR)
    })
}
