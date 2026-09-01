/*
    slow.ts - Clients that read and write deliberately slowly, for the flow-control tests

    slowRead() reads a response slowly; slowWrite() sends a request body slowly. Both share one
    response reader, because both need the same thing from it: a byte count of the decoded entity
    body, which is not the same as a count of the bytes on the wire.

    The point of a slow-reader test is to make the server's write queue fill and then drain, so
    HOW the client is slow decides whether the test tests anything.

    cgi/pausing.tst.ts and fast/pausing.tst.ts sleep between read() calls on the Ejscript client.
    That slows the application but not the transport: the shim keeps draining the socket into its own
    buffer, so the kernel receive window stays open and the server may never be asked to stop. Those
    tests pass either way.

    This pauses the SOCKET. socket.pause() stops reading it, the receive buffer fills, the window
    closes, the server's writes start to block, and the queue it is writing into fills -- which is
    the mechanism under test. Resuming lets it drain. A server with no backpressure either loses
    bytes or grows without bound, and the byte count catches the first.

    Two assertions per handler, and neither is redundant. The total catches a defect that drops data;
    the tail catches one that duplicates or reorders it. A run that checks only the total passes when
    a window's worth is replayed in place of the next; one that checks only the tail passes when a
    window is dropped from the middle.
 */

import {tget} from '@embedthis/testme'
import * as net from 'node:net'

const URL_ = new URL(tget('TM_HTTP') || 'http://127.0.0.1:4100')
export const PORT = parseInt(URL_.port || '80', 10)
export const ADDRESS = URL_.hostname
export const HOST = URL_.host

export interface SlowReply {
    status: number
    //  Total body bytes received, headers excluded
    bytes: number
    //  The last 64 bytes of the body, so the tail can be checked without holding the whole thing
    tail: string
    //  The first 64 bytes, likewise
    head: string
    /*
        The whole decoded body, but only when keepBody was asked for. The response tests move
        megabytes and need none of it; the request tests need to read a byte count out of a gateway's
        output. Holding it unconditionally would make every slow-reader case carry a megabyte of
        string for nothing.
     */
    text: string
    //  How many times the socket was paused. Zero means the response arrived in one segment and
    //  this was not a slow-reader test at all.
    pauses: number
    closed: boolean
}

/*
    Completion is decided by the message, not by the connection.

    Waiting for the close instead looks simpler and is wrong: the FastCGI route answers a complete
    response and holds the connection, so a reader that waits for EOF waits for the whole timeout and
    the test appears to hang rather than to pass. Finishing on the terminal chunk or on Content-Length
    ends every case as soon as the body is whole, and leaves the timeout for the failure it is meant
    to catch -- a response that never completes at all.
 */

export interface SlowOptions {
    //  Milliseconds to hold the socket paused after each chunk
    pauseMs?: number
    //  Stop pausing after this many, so a response arriving in many small chunks cannot make the
    //  test take minutes. The queue has long since filled by then.
    maxPauses?: number
    timeout?: number
    headers?: string[]
    method?: string
    //  Accumulate the whole decoded body into SlowReply.text
    keepBody?: boolean
}

export interface WriteOptions extends SlowOptions {
    //  Write the body in pieces of this many bytes
    pieceSize?: number
    //  Milliseconds between pieces
    pieceDelay?: number
    contentType?: string
    //  Send the body with Transfer-Encoding: chunked, one chunk per piece
    chunked?: boolean
}

/*
    Request "path" and read it back slowly. Returns once the body is whole or the timeout expires.
 */
export async function slowRead(path: string, options: SlowOptions = {}): Promise<SlowReply> {
    return exchange(path, null, options)
}

/*
    POST "body" a piece at a time, with a delay between pieces, and read the reply.

    The mirror of slowRead: the server is the one that must apply backpressure there, and the one
    that must tolerate its absence here. A body arriving in 200-byte pieces over several seconds
    crosses every packet boundary the parsers have, which is the case a client library never produces
    because it writes what it has.
 */
export async function slowWrite(path: string, body: string, options: WriteOptions = {}): Promise<SlowReply> {
    return exchange(path, body, options)
}

function exchange(path: string, body: string | null, options: WriteOptions = {}): Promise<SlowReply> {
    const pauseMs = options.pauseMs != null ? options.pauseMs : 15
    const maxPauses = options.maxPauses != null ? options.maxPauses : 40
    const timeout = options.timeout != null ? options.timeout : 60000
    const pieceSize = options.pieceSize != null ? options.pieceSize : 0
    const pieceDelay = options.pieceDelay != null ? options.pieceDelay : 0
    const sendChunked = options.chunked == true
    const keepBody = options.keepBody == true

    const requestLines: string[] = [
        (options.method || (body == null ? 'GET' : 'POST')) + ' ' + path + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
    ]
    if (body != null) {
        requestLines.push('Content-Type: ' + (options.contentType || 'application/x-www-form-urlencoded'))
        if (sendChunked) {
            requestLines.push('Transfer-Encoding: chunked')
        } else {
            requestLines.push('Content-Length: ' + body.length)
        }
    }
    requestLines.push(...(options.headers || []), '', '')
    const request = requestLines.join('\r\n')

    return new Promise<SlowReply>(resolvePromise => {
        const socket = net.connect(PORT, ADDRESS)
        let header = ''
        let inBody = false
        let chunked = false
        //  Content-Length when the response carries one, otherwise -1
        let length = -1
        //  Undecoded transfer bytes, held while a chunk header or its trailing CRLF is incomplete
        let pending = ''
        let remaining = 0
        let state: 'size' | 'data' | 'crlf' | 'end' = 'size'
        let status = 0
        let bytes = 0
        let head = ''
        let tail = ''
        let text = ''
        let pauses = 0
        let closed = false
        let done = false

        const finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise({status, bytes, tail, head, text, pauses, closed})
            }
        }
        const timer = setTimeout(finish, timeout)

        const consume = (data: string) => {
            if (data.length == 0) {
                return
            }
            if (head.length < 64) {
                head = (head + data).slice(0, 64)
            }
            bytes += data.length
            tail = (tail + data).slice(-64)
            if (keepBody) {
                text += data
            }
        }

        /*
            Decode chunked transfer coding.

            Not optional, and it is what this helper got wrong first. Counting the transfer bytes
            instead means counting the chunk-size lines, and the server chooses chunk sizes from how
            much it has ready to write -- which is precisely what slowing the reader changes. The two
            reads then differ by a few bytes of framing every run and the test reports a data loss
            that never happened. Decode, and the count is the entity body both times.
         */
        const decode = (data: string) => {
            pending += data
            for (;;) {
                if (state == 'size') {
                    const nl = pending.indexOf('\r\n')
                    if (nl < 0) {
                        return
                    }
                    const size = parseInt(pending.slice(0, nl).split(';')[0], 16)
                    pending = pending.slice(nl + 2)
                    if (!(size > 0)) {
                        //  Terminal chunk. Trailers and the final CRLF are not body.
                        state = 'end'
                        pending = ''
                        finish()
                        return
                    }
                    remaining = size
                    state = 'data'

                } else if (state == 'data') {
                    const take = Math.min(remaining, pending.length)
                    consume(pending.slice(0, take))
                    pending = pending.slice(take)
                    remaining -= take
                    if (remaining > 0) {
                        return
                    }
                    state = 'crlf'

                } else if (state == 'crlf') {
                    //  The CRLF that terminates the chunk data. It can arrive in its own segment,
                    //  which is why this is a state and not two characters sliced off in passing --
                    //  getting that wrong desynchronises the decoder and loses the rest of the body.
                    if (pending.length < 2) {
                        return
                    }
                    pending = pending.slice(2)
                    state = 'size'

                } else {
                    return
                }
            }
        }

        /*
            Write the body a piece at a time. A chunked body sends one chunk per piece, which is
            where the interesting framing is: the parser sees a chunk size line, its data and its
            CRLF arrive in separate reads.
         */
        const writeBody = async () => {
            if (body == null) {
                return
            }
            try {
                const size = pieceSize > 0 ? pieceSize : body.length
                for (let offset = 0; offset < body.length && !done; offset += size) {
                    const piece = body.slice(offset, offset + size)
                    socket.write(sendChunked ? piece.length.toString(16) + '\r\n' + piece + '\r\n' : piece)
                    if (pieceDelay > 0) {
                        await Bun.sleep(pieceDelay)
                    }
                }
                if (sendChunked && !done) {
                    socket.write('0\r\n\r\n')
                }
            } catch {
                //  The server refused and closed mid-write; the reply below is what decides
            }
        }

        socket.on('connect', () => {
            socket.write(request)
            writeBody()
        })

        socket.on('data', chunk => {
            /*
                latin1 throughout, so one character is one byte. Decoding as UTF-8 would silently
                merge byte pairs into single characters and every count below would be wrong for any
                body that is not ASCII.
             */
            let body = chunk.toString('latin1')
            if (!inBody) {
                header += body
                const end = header.indexOf('\r\n\r\n')
                if (end < 0) {
                    return
                }
                const m = header.match(/^HTTP\/1\.[01] (\d\d\d)/)
                status = m ? parseInt(m[1], 10) : 0
                const head_ = header.slice(0, end)
                chunked = /\r\ntransfer-encoding:\s*chunked/i.test(head_)
                const cl = head_.match(/\r\ncontent-length:\s*(\d+)/i)
                length = cl ? parseInt(cl[1], 10) : -1
                body = header.slice(end + 4)
                inBody = true
            }
            if (chunked) {
                decode(body)
            } else {
                consume(body)
                if (length >= 0 && bytes >= length) {
                    finish()
                }
            }
            if (done) {
                return
            }
            if (pauses < maxPauses) {
                pauses++
                socket.pause()
                setTimeout(() => socket.resume(), pauseMs)
            }
        })

        socket.on('close', () => {
            closed = true
            finish()
        })
        socket.on('error', () => {})
    })
}
