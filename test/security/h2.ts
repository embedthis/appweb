/*
    h2.ts - Raw HTTP/2 framing helpers for exact-byte tests.
 */

import net from 'node:net'

export const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
export const END_STREAM = 0x1
export const END_HEADERS = 0x4
export const PROTOCOL_ERROR = 0x1

export interface H2Result {
    closed: boolean
    data: string
    goaway: number
    headers: number
    reset: number
}

export function frame(type: number, flags: number, stream: number, payload: Buffer): Buffer {
    let header = Buffer.alloc(9)
    header.writeUIntBE(payload.length, 0, 3)
    header[3] = type
    header[4] = flags
    header.writeUInt32BE(stream & 0x7fffffff, 5)
    return Buffer.concat([header, payload])
}

/*
    Encode an HPACK integer; pad adds zero continuation bytes without changing its value.
 */
export function hpackInt(value: number, prefix: number, first: number, pad = 0): Buffer {
    let mask = (1 << prefix) - 1
    let bytes: number[] = []
    if (value < mask && pad == 0) {
        bytes.push(first | value)
        return Buffer.from(bytes)
    }
    bytes.push(first | mask)
    value -= mask
    let rest: number[] = []
    while (value >= 128) {
        rest.push(value % 128)
        value = Math.floor(value / 128)
    }
    rest.push(value)
    while (rest.length < pad) {
        rest.push(0)
    }
    for (let i = 0; i < rest.length; i++) {
        bytes.push(rest[i] | (i < rest.length - 1 ? 0x80 : 0))
    }
    return Buffer.from(bytes)
}

export function hpackString(value: string, pad = 0): Buffer {
    let bytes = Buffer.from(value)
    return Buffer.concat([hpackInt(bytes.length, 7, 0, pad), bytes])
}

//  Literal field without indexing, new name
export function literal(name: string, value: string): Buffer {
    return Buffer.concat([Buffer.from([0]), hpackString(name), hpackString(value)])
}

//  Literal field without indexing, name taken from the table
export function literalIndexedName(index: number, value: string, pad = 0): Buffer {
    return Buffer.concat([hpackInt(index, 4, 0), hpackString(value, pad)])
}

export function requestBlock(path: string, authority: string, extra: Buffer[] = []): Buffer {
    return Buffer.concat([
        Buffer.from([0x82]),                    // :method GET
        Buffer.from([0x86]),                    // :scheme http
        literalIndexedName(4, path),            // :path
        literalIndexedName(1, authority),       // :authority
        ...extra,
    ])
}

/*
    Send a framed request and wait for completion, reset, GOAWAY, or timeout.
 */
export async function sendH2(port: number, block: Buffer, timeout = 2000, body?: Buffer): Promise<H2Result> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(port, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: H2Result = {closed: false, data: '', goaway: 0, headers: 0, reset: 0}
        let finish = () => {
            clearTimeout(timer)
            socket.destroy()
            resolvePromise(result)
        }
        let timer = setTimeout(finish, timeout)

        socket.on('connect', () => {
            socket.write(Buffer.concat([
                Buffer.from(PREFACE),
                frame(4, 0, 0, Buffer.alloc(0)),
                ...(body ? [frame(1, END_HEADERS, 1, block), frame(0, END_STREAM, 1, body)]
                    : [frame(1, END_HEADERS | END_STREAM, 1, block)]),
            ]))
        })
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
            let done = false
            while (pending.length >= 9) {
                let length = pending.readUIntBE(0, 3)
                if (pending.length < 9 + length) {
                    break
                }
                let type = pending[3]
                let flags = pending[4]
                let payload = pending.subarray(9, 9 + length)
                pending = pending.subarray(9 + length)
                if (type == 0) {
                    result.data += payload.toString()
                } else if (type == 1) {
                    result.headers++
                } else if (type == 3 && payload.length >= 4) {
                    result.reset = payload.readUInt32BE(0)
                } else if (type == 7 && payload.length >= 8) {
                    result.goaway = payload.readUInt32BE(4)
                }
                if ((type <= 1 && (flags & END_STREAM)) || result.goaway || result.reset) {
                    done = true
                }
            }
            if (done) {
                finish()
            }
        })
        socket.on('close', () => {
            result.closed = true
        })
        socket.on('error', reject)
    })
}
