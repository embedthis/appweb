/*
    multipart.ts - Build and send multipart/form-data bodies over a raw socket

    The upload tests must control the exact bytes of the body: a malformed multipart is precisely one
    a client library will not produce, and the boundary-straddle case needs the body divided at a
    chosen offset rather than wherever the client happens to flush. So these drive a socket directly,
    the same way test/security/raw.ts does for the framing ratchets.

    Two things here are deliberate and easy to "simplify" wrongly:

    - contentLength is computed from the body by default but can be overridden. Overriding it is the
      only way to send a body the server believes is longer than it is, which is what the truncation
      case needs.
    - terminate defaults true. Setting it false omits the closing "--boundary--", which is a
      different failure from a short Content-Length: the body is complete on the wire and incomplete
      as a multipart document.
 */

import {tget} from '@embedthis/testme'
import * as net from 'node:net'

const URL_ = new URL(tget('TM_HTTP') || 'http://127.0.0.1:4100')
export const PORT = parseInt(URL_.port || '80', 10)
export const ADDRESS = URL_.hostname
export const HOST = URL_.host

//  The upload route that carries a CGI target. -e prints the environment, -p the posted body.
export const CGI_UPLOAD = '/upload/cgiProgram.cgi?-e+-p'

export const BOUNDARY = '----scenario-tests-boundary'

export interface Part {
    //  Content-Disposition name. Omitted to exercise the missing-name rejection.
    name?: string
    //  Present makes this a file part
    filename?: string
    contentType?: string
    value?: string
    //  When set, this replaces the entire generated part -- for bodies no builder should produce
    raw?: string
}

export interface SendOptions {
    boundary?: string
    //  Full Content-Type header value. Overrides the value derived from the boundary.
    contentType?: string
    //  Overrides the computed Content-Length
    contentLength?: number
    //  Emit the closing "--boundary--". False leaves the document unterminated.
    terminate?: boolean
    /*
        Frame the body with Transfer-Encoding: chunked instead of a Content-Length. Each piece
        becomes one chunk and the terminating "0" chunk is written on its own, after pieceDelay --
        which is the arrangement the deferred end-of-input case needs and a client library will not
        produce on demand.
     */
    chunked?: boolean
    //  Write the body in pieces of this many bytes
    pieceSize?: number
    //  Milliseconds between pieces
    pieceDelay?: number
    //  Split the body at exactly this offset, into two writes. Takes precedence over pieceSize.
    splitAt?: number
    method?: string
    /*
        Stop reading as soon as this appears. Omit it -- which is what the rejection cases do -- to
        read to EOF, so the close is observed rather than inferred.
     */
    marker?: string
    //  Milliseconds before giving up on a server that neither answers nor closes
    timeout?: number
    //  Extra request headers, each a complete "Name: value" line
    headers?: string[]
}

export interface Reply {
    text: string
    closed: boolean
    //  Status code parsed from the response line, or 0 if there was no parseable response
    status: number
}

export function part(p: Part): string {
    if (p.raw != null) {
        return p.raw
    }
    let disposition = 'Content-Disposition: form-data'
    if (p.name != null) {
        disposition += '; name="' + p.name + '"'
    }
    if (p.filename != null) {
        disposition += '; filename="' + p.filename + '"'
    }
    let lines = [disposition]
    if (p.contentType) {
        lines.push('Content-Type: ' + p.contentType)
    }
    lines.push('')
    lines.push(p.value != null ? p.value : '')
    return lines.join('\r\n')
}

export function buildBody(parts: Part[], boundary: string = BOUNDARY, terminate: boolean = true): string {
    let out: string[] = []
    for (let p of parts) {
        out.push('--' + boundary)
        out.push(part(p))
    }
    if (terminate) {
        out.push('--' + boundary + '--')
        out.push('')
    }
    return out.join('\r\n')
}

/*
    The byte offset of the closing boundary within a built body. The split-boundary test needs a
    write to end partway through those bytes, and guessing an offset is how such a test comes to
    exercise nothing.
 */
export function closingBoundaryOffset(body: string, boundary: string = BOUNDARY): number {
    return body.lastIndexOf('--' + boundary + '--')
}

function parseStatus(text: string): number {
    let m = text.match(/^HTTP\/1\.[01] (\d\d\d)/)
    return m ? parseInt(m[1], 10) : 0
}

/*
    Send one request carrying the given body and read the reply.

    Driven on node's net rather than the Ejscript Socket shim, and the reason is not style. A refused
    upload is closed by the server while the client is still writing, so the write draws EPIPE. On
    the shim that exception aborts the read loop, and a server that closed correctly is recorded as
    one that did not -- which is exactly the property these tests exist to assert. Here the write
    error is ignored and 'close' is authoritative, the same shape test/security/body-size-limit.tst.ts
    uses for the same reason.

    Reading to EOF also removes the segmentation dependence raw.ts records: the status line can
    arrive in its own segment, so reading a fixed number of times is a coin toss that landed
    differently on macOS and Linux for the identical server.
 */
export async function sendBody(path: string, body: string, options: SendOptions = {}): Promise<Reply> {
    let boundary = options.boundary != null ? options.boundary : BOUNDARY
    let type = options.contentType != null ? options.contentType : 'multipart/form-data; boundary=' + boundary
    let length = options.contentLength != null ? options.contentLength : body.length
    let marker = options.marker
    let timeout = options.timeout != null ? options.timeout : 15000

    let head = [
        (options.method || 'POST') + ' ' + path + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: ' + type,
        options.chunked ? 'Transfer-Encoding: chunked' : 'Content-Length: ' + length,
    ]
    if (options.headers) {
        head = head.concat(options.headers)
    }
    head.push('')
    head.push('')

    return await new Promise<Reply>(resolvePromise => {
        let socket = net.connect(PORT, ADDRESS)
        let text = ''
        let closed = false
        let done = false

        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise({text, closed, status: parseStatus(text)})
            }
        }
        let timer = setTimeout(finish, timeout)

        let write = (piece: string) => {
            socket.write(options.chunked ? piece.length.toString(16) + '\r\n' + piece + '\r\n' : piece)
        }

        let writeBody = async () => {
            try {
                if (options.splitAt != null && options.splitAt > 0 && options.splitAt < body.length) {
                    write(body.slice(0, options.splitAt))
                    await Bun.sleep(options.pieceDelay != null ? options.pieceDelay : 20)
                    write(body.slice(options.splitAt))

                } else if (options.pieceSize && options.pieceSize > 0) {
                    for (let offset = 0; offset < body.length && !done; offset += options.pieceSize) {
                        write(body.slice(offset, offset + options.pieceSize))
                        if (options.pieceDelay) {
                            await Bun.sleep(options.pieceDelay)
                        }
                    }
                } else {
                    write(body)
                }
                if (options.chunked && !done) {
                    await Bun.sleep(options.pieceDelay != null ? options.pieceDelay : 20)
                    socket.write('0\r\n\r\n')
                }
            } catch {
                //  The server refused and closed mid-write. 'close' below is what decides.
            }
        }

        socket.on('connect', () => {
            socket.write(head.join('\r\n'))
            writeBody()
        })
        socket.on('data', chunk => {
            text += chunk.toString()
            if (marker && text.includes(marker)) {
                finish()
            }
        })
        socket.on('close', () => {
            closed = true
            finish()
        })
        socket.on('error', () => {})
    })
}

export async function upload(path: string, parts: Part[], options: SendOptions = {}): Promise<Reply> {
    let boundary = options.boundary != null ? options.boundary : BOUNDARY
    let terminate = options.terminate != null ? options.terminate : true
    return sendBody(path, buildBody(parts, boundary, terminate), options)
}

//  A file part whose body is "size" bytes of a repeating printable pattern
export function payload(size: number): string {
    let line = '0123456789012345678901234567890123456789012345678\n'
    let out = ''
    while (out.length < size) {
        out += line
    }
    return out.slice(0, size)
}
