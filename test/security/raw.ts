/*
    raw.ts - Raw socket helpers for the HTTP framing and header ratchets

    These ratchets must control the exact bytes on the wire, so they bypass the Http client and drive a socket
    directly. Each helper opens a connection, writes one request and reads until the expected marker arrives.

    A rejected request must also close the connection: RFC 9112 6.1 requires it, because server and front-end
    have provably disagreed about where the message ends. reject() asserts that. An accepted request must not
    close, so accept() never reads past its marker -- the ejs Socket shim costs a 5s read timeout whenever the
    connection stays open.
 */

import {teq, tget, ttrue} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

export const HTTP = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
export const HOST = HTTP.host

//  A CGI route that echoes its environment and reports the number of posted body bytes it received
export const CGI = '/cgiProgram.cgi?switches=-e%20-p'

export interface Reply {
    //  The bytes as they arrived, chunk framing included. Use this only to reason about the framing
    text: string
    /*
        The same response with the chunk framing removed. Match content against this: a chunk-size line
        can land in the middle of a marker, and where it falls depends on the size of the CGI environment
        dump, so a match against the raw bytes passes or fails by luck. It is the environment that decides
        it, so the same server passes on a developer machine and fails under CI, where the environment is
        several KB larger.
     */
    decoded: string
    //  The server closed the connection. Only determined when detectClose is set
    closed: boolean
}

/*
    Write one request and read until the marker arrives. With detectClose, keep reading until EOF.

    The marker is in the status line, so it can arrive before the rest of the response: reading exactly
    once more then returns the body rather than the close, and a server that closed correctly is recorded
    as one that did not. That is scheduling, not behaviour -- the multipart rejection below is answered
    after its CGI gateway is torn down, and Linux split the response where macOS did not, so the same
    server passed here and failed there. Draining to EOF asserts the same property without depending on
    how the response was segmented; a server that really does hold the connection open still costs the
    shim's 5s read timeout, which is the price of the failure, not of the pass.
 */
export async function send(request: string, marker: string, detectClose: boolean = false): Promise<Reply> {
    let s = new Socket
    //  Sized for the CGI environment dump, which is several KB. A ByteArray does not grow on read.
    let response = new ByteArray(65536)
    let closed = false
    s.connect(HTTP.address)
    try {
        await s.write(request)
        for (let i = 0; i < 20 && !dechunk(response.toString()).includes(marker); i++) {
            if ((await s.read(response, -1)) == null) {
                closed = true
                break
            }
        }
        for (let i = 0; detectClose && !closed && i < 20; i++) {
            if ((await s.read(response, -1)) == null) {
                closed = true
            }
        }
    } catch {
        //  A read timeout means the server is holding the connection open
    }
    s.close()
    let text = response.toString()
    return {text, decoded: dechunk(text), closed}
}

/*
    Decode a chunked body so a marker matches the content a client would see rather than the wire bytes.
    A chunk-size line can land in the middle of the marker, and where that boundary falls depends on the
    size of the CGI environment dump, so a raw substring match passes or fails by luck.

    Tolerates a truncated stream: this runs on a partially read response while deciding whether to keep
    reading, so it decodes as far as the bytes allow and returns that. A response that is not chunked,
    or whose headers have not arrived yet, is returned unchanged.
 */
export function dechunk(text: string): string {
    let sep = text.indexOf('\r\n\r\n')
    if (sep < 0 || !/^transfer-encoding:[ \t]*chunked/im.test(text.slice(0, sep))) {
        return text
    }
    let headers = text.slice(0, sep + 4)
    let body = ''
    let pos = sep + 4
    while (pos < text.length) {
        let eol = text.indexOf('\r\n', pos)
        if (eol < 0) {
            break
        }
        //  NaN from a truncated size line, or 0 for the terminating chunk, both end the decode
        let size = parseInt(text.slice(pos, eol).split(';')[0], 16)
        if (!(size > 0)) {
            break
        }
        body += text.slice(eol + 2, eol + 2 + size)
        pos = eol + 2 + size + 2
    }
    return headers + body
}

/*
    Count the response lines. A rejected request must not leave a second response on the connection -- that
    would mean the rejected bytes were framed as a further request.
 */
export function responses(text: string): number {
    return text.split('HTTP/1.').length - 1
}

export async function reject(name: string, request: string, status: string): Promise<void> {
    let reply = await send(request, status, true)
    if (!reply.text.includes(status) || responses(reply.text) != 1) {
        console.log(name + ' expected a single "' + status + '" but got:\n' + reply.text)
    }
    ttrue(reply.text.includes(status))
    teq(responses(reply.text), 1)
    if (!reply.closed) {
        console.log(name + ' rejected the request but did not close the connection')
    }
    ttrue(reply.closed)
}

/*
    A CGI response body echoes the environment, so it contains "HTTP/1." itself and the response count cannot
    be used here. The marker is the signal that the request was framed as intended.
 */
export async function accept(name: string, request: string, marker: string): Promise<void> {
    let reply = await send(request, marker)
    if (!reply.decoded.includes('200 OK') || !reply.decoded.includes(marker)) {
        console.log(name + ' expected a 200 containing "' + marker + '" but got:\n' + reply.text)
    }
    ttrue(reply.decoded.includes('200 OK'))
    ttrue(reply.decoded.includes(marker))
}
