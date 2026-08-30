/*
    body-size-limit.tst.ts - LimitRequestBody is enforced against the whole body, on every framing and protocol

    LimitRequestBody bounds the size of a request body. It used to be enforced from two places, and neither could
    see a running total:

    - processParsed() rejects from the declared Content-Length, before any body byte is read. A chunked request
      declares no length and an HTTP/2 request never populates the field that check reads, so it fires for
      neither. It also skipped uploads outright.
    - incomingTail() compared the depth of the read queue against the limit. For a handler that forwards body
      data straight to a backend -- CGI, FastCGI, the proxy -- and for the upload filter, which writes it to
      disk, nothing ever accumulates on that queue, so the depth stays at whatever single packet is in flight.

    So a client could stream an unbounded body to a CGI, a FastCGI app, a proxied upstream or the upload
    directory by keeping each chunk, and each declared length, small (CWE-770). The bytes are now counted as the
    protocol filters decode them and tested against the limit there, which is upstream of every handler and
    common to both protocols.

    Each case below sends far more than the configured limit while keeping every individual chunk, frame and
    declared length well under it, so nothing but a cumulative count can reject it.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readdirSync, statSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from './server'

//  Reports the number of posted body bytes it received, and its environment for the upload cases
const CGI = '/cgiProgram.cgi?switches=-e%20-p'

const LIMIT = 65536
const H2_LIMIT = 32768
const KB = 'x'.repeat(1024)

//  What the CGI reports when it has been handed the whole 128KB body. It must never appear
const FULL_BODY = 'Post Data 131072 bytes found'

interface Reply {
    text: string
    closed: boolean
}

/*
    Write one request and read the reply. Once a limit trips, the server responds and closes, so the rest of a
    body that is still being written draws EPIPE -- that is the expected outcome here, not a test failure.

    A rejection closes the connection, so those cases end on the close. An accepted request keeps the connection
    alive, so those pass the marker they are waiting for and end on that rather than on the timeout.
 */
async function send(port: number, request: Buffer, marker = '', timeout = 15000): Promise<Reply> {
    return await new Promise<Reply>(resolvePromise => {
        let socket = net.connect(port, '127.0.0.1')
        let reply: Reply = {text: '', closed: false}
        let done = false

        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise(reply)
            }
        }
        let timer = setTimeout(finish, timeout)

        socket.on('connect', () => socket.write(request))
        socket.on('data', chunk => {
            reply.text += chunk.toString()
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

function head(method: string, path: string, port: number, headers: string[]): string {
    return [`${method} ${path} HTTP/1.1`, `Host: 127.0.0.1:${port}`, ...headers, '', ''].join('\r\n')
}

//  Chunk encode "body" in 1KB chunks. Every chunk is far below any limit under test here
function chunkEncode(body: string): string {
    let encoded = ''
    for (let i = 0; i < body.length; i += 1024) {
        let chunk = body.slice(i, i + 1024)
        encoded += `${chunk.length.toString(16)}\r\n${chunk}\r\n`
    }
    return encoded + '0\r\n\r\n'
}

function multipart(count: number): string {
    let part = [
        '--BOUNDARY',
        'Content-Disposition: form-data; name="file"; filename="payload.dat"',
        'Content-Type: application/octet-stream',
        '',
        '',
    ].join('\r\n')
    return part + KB.repeat(count) + '\r\n--BOUNDARY--\r\n'
}

//  Total bytes the upload filter has written under "dir"
function bytesOnDisk(dir: string): number {
    if (!existsSync(dir)) {
        return 0
    }
    return readdirSync(dir).reduce((total, name) => total + statSync(resolve(dir, name)).size, 0)
}

/************************************ HTTP/2 **********************************/

const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
const END_STREAM = 0x1
const END_HEADERS = 0x4

interface H2Reply {
    closed: boolean
    data: string
    ended: boolean
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

//  Literal header field without indexing, name taken from the static table
function literalIndexedName(index: number, value: string): Buffer {
    return Buffer.concat([Buffer.from([index]), hpackString(value)])
}

function postBlock(port: number): Buffer {
    return Buffer.concat([
        Buffer.from([0x83]),                        // :method POST
        Buffer.from([0x86]),                        // :scheme http
        literalIndexedName(4, CGI),                 // :path
        literalIndexedName(1, `127.0.0.1:${port}`), // :authority
    ])
}

/*
    POST "count" DATA frames of 4KB to the CGI. No content-length is declared, which HTTP/2 permits, so nothing
    but a running total of the DATA payloads can bound the body.
 */
async function h2Post(port: number, count: number, timeout = 5000): Promise<H2Reply> {
    return await new Promise<H2Reply>(resolvePromise => {
        let socket = net.connect(port, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let reply: H2Reply = {closed: false, data: '', ended: false, goaway: 0, reset: 0}
        let done = false

        let frames = [Buffer.from(PREFACE), frame(4, 0, 0, Buffer.alloc(0)), frame(1, END_HEADERS, 1, postBlock(port))]
        for (let i = 0; i < count; i++) {
            let last = i == count - 1
            frames.push(frame(0, last ? END_STREAM : 0, 1, Buffer.from(KB.repeat(4))))
        }

        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise(reply)
            }
        }
        let timer = setTimeout(finish, timeout)

        socket.on('connect', () => socket.write(Buffer.concat(frames)))
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
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
                    reply.data += payload.toString()
                } else if (type == 3 && payload.length >= 4) {
                    reply.reset = payload.readUInt32BE(0)
                } else if (type == 7 && payload.length >= 8) {
                    reply.goaway = payload.readUInt32BE(4)
                }
                /*
                    A rejection ends the stream but leaves the HTTP/2 connection up, which is correct, so waiting
                    for a close would only buy a timeout. The reply is complete once its stream ends.
                 */
                if ((type == 0 || type == 1) && (flags & END_STREAM)) {
                    reply.ended = true
                }
            }
            if (reply.goaway || reply.ended) {
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

/************************************* Tests **********************************/

function rejected(name: string, reply: Reply): void {
    if (!reply.text.includes('413 Request Entity Too Large')) {
        console.log(name + ' expected a 413 but got:\n' + reply.text.slice(0, 1024))
    }
    ttrue(reply.text.includes('413 Request Entity Too Large'))
    ttrue(reply.closed)
}

function accepted(name: string, reply: Reply, marker: string): void {
    if (!reply.text.includes('200 OK') || !reply.text.includes(marker)) {
        console.log(name + ' expected a 200 containing "' + marker + '" but got:\n' + reply.text.slice(0, 1024))
    }
    ttrue(reply.text.includes('200 OK'))
    ttrue(reply.text.includes(marker))
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    /*
        Chunked. Every chunk is 1KB, so the per-chunk size test never fires and only a running total can reject
        these. LimitRequestForm is left high so that the body limit is the one under test for the form case.
     */
    await withServer('body-limit-chunked', 4520, [
        'AddHandler cgiHandler cgi',
        'CgiPrefix "CGI_"',
        'LimitRequestForm 1MB',
        `LimitRequestBody ${LIMIT}`,
    ], async () => {
        let port = 4520
        let streaming = head('POST', CGI, port, ['Transfer-Encoding: chunked'])

        let under = await send(port, Buffer.from(streaming + chunkEncode(KB.repeat(32))), 'Post Data 32768 bytes found')
        accepted('chunked under the limit', under, 'Post Data 32768 bytes found')

        /*
            A form body is buffered rather than streamed, so the handler has not run and the rejection is the
            whole of what the client sees.
         */
        let form = head('POST', CGI, port,
                        ['Content-Type: application/x-www-form-urlencoded', 'Transfer-Encoding: chunked'])
        let buffered = await send(port, Buffer.from(form + chunkEncode(KB.repeat(128))))
        rejected('chunked form over the limit', buffered)

        /*
            Streamed to the gateway. A streaming handler starts before the body arrives and the CGI writes its
            own output as soon as it starts, so it can have committed a response before the limit trips and the
            status the client ends up with is not fixed. What must hold is that the gateway is never handed the
            whole body and that the request is terminated. Rejecting before the handler runs at all is a separate
            defect, tracked on its own.
         */
        let over = await send(port, Buffer.from(streaming + chunkEncode(KB.repeat(128))), FULL_BODY)
        if (over.text.includes(FULL_BODY) || !over.closed) {
            console.log('chunked over the limit reached the gateway:\n' + over.text.slice(0, 1024))
        }
        ttrue(!over.text.includes(FULL_BODY))
        ttrue(over.closed)

        //  A declared length over the limit is refused from the length alone
        let declared = await send(port, Buffer.from(head('POST', CGI, port, ['Content-Length: 131072']) +
            KB.repeat(128)), FULL_BODY)
        ttrue(!declared.text.includes(FULL_BODY))
        ttrue(declared.closed)
    })

    /*
        Uploads. processParsed() skipped its declared-length test whenever rx->upload was set, and the upload
        filter writes file content straight to disk without it ever reaching a queue, so neither existing test
        could see an upload of any size. The per-file LimitUpload test does not bound a request either -- it is
        left at 4GB here so that the request total is the only thing that can reject these.
     */
    await withServer('body-limit-upload', 4521, [
        'AddHandler cgiHandler cgi',
        'CgiPrefix "CGI_"',
        'AddFilter uploadFilter',
        `UploadDir ${workDir('body-limit-upload')}/uploads`,
        'UploadAutoDelete off',
        'LimitUpload 4GB',
        `LimitRequestBody ${LIMIT}`,
    ], async () => {
        let port = 4521
        let uploads = resolve(workDir('body-limit-upload'), 'uploads')
        let type = 'Content-Type: multipart/form-data; boundary=BOUNDARY'
        mkdirSync(uploads, {recursive: true})

        let body = multipart(16)
        let under = await send(port, Buffer.from(head('POST', CGI, port, [type, `Content-Length: ${body.length}`]) + body),
            'CGI_FILE_1_CLIENT_FILENAME=payload.dat')
        accepted('upload under the limit', under, 'CGI_FILE_1_CLIENT_FILENAME=payload.dat')

        //  Chunked, so there is no declared length to reject it by. Only a running total can.
        let big = multipart(128)
        let over = await send(port,
            Buffer.from(head('POST', CGI, port, [type, 'Transfer-Encoding: chunked']) + chunkEncode(big)))
        rejected('chunked upload over the limit', over)

        /*
            The point of the defect is that the bytes land on disk before anything checks. Allow one packet of
            overshoot past the limit, not a whole 128KB upload.
         */
        let written = bytesOnDisk(uploads)
        if (written > LIMIT + 16 * 1024) {
            console.log(`upload wrote ${written} bytes to disk with a ${LIMIT} byte limit`)
        }
        ttrue(written <= LIMIT + 16 * 1024)

        //  A declared length over the limit is now refused up front for an upload too
        let declared = await send(port, Buffer.from(head('POST', CGI, port, [type, `Content-Length: ${big.length}`]) + big))
        rejected('declared upload length over the limit', declared)
    })

    /*
        HTTP/2. rx->length is only ever written by the HTTP/1 header parser, so processParsed()'s declared-length
        test is dead code for every HTTP/2 request, and h2's own counters are compared only to each other for
        framing consistency. The limit is under the 65535 initial flow control window so the rejection, not the
        window, is what ends the request.
     */
    await withServer('body-limit-http2', 4522, [
        'AddHandler cgiHandler cgi',
        'CgiPrefix "CGI_"',
        `LimitRequestBody ${H2_LIMIT}`,
    ], async () => {
        let under = await h2Post(4522, 4)
        if (!under.data.includes('Post Data 16384 bytes found')) {
            console.log('h2 under the limit expected the CGI reply but got ' + JSON.stringify(under))
        }
        ttrue(under.data.includes('Post Data 16384 bytes found'))
        teq(under.goaway, 0)

        let over = await h2Post(4522, 16)
        if (over.data.includes('Post Data') || !over.data.includes('Request Entity Too Large')) {
            console.log('h2 over the limit expected a 413 page but got ' + JSON.stringify(over))
        }
        ttrue(!over.data.includes('Post Data'))
        ttrue(over.data.includes('Request Entity Too Large'))
    })
}
