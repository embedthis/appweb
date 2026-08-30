/*
    framing-proxy.tst.ts - Transfer-Encoding framing ratchet for responses

    The HTTP/1 header parser is shared: it frames server requests and client responses through the same code.
    security/framing.tst.ts covers the request side. This covers the response side, where Appweb is the
    client -- a proxy reading a response from a backend it does not control.

    A backend that frames a response ambiguously must never have that response relayed downstream, or the
    proxy becomes the desync it was supposed to prevent. The test serves hostile responses from a backend of
    its own and asserts the body never reaches the downstream client.

    Note: a rejected response currently leaves the downstream request hanging rather than answering 502, so
    these cases are asserted by timeout. The body not being relayed is the property that matters here; the
    missing error response is tracked separately.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Uri} from '@embedthis/ejscript'

const HTTP = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
const PROXY = `http://${HTTP.host}:${HTTP.port}/badproxy/x`
const BACKEND = 9997
const BODY = 'HELLO'

/*
    Serve one canned response from a backend on the port the badproxy route connects to, then make a request
    through the proxy. Returns the downstream status and body, or null if the proxy never answered.
 */
async function throughProxy(reply: string, timeout: number): Promise<{status: number, body: string} | null> {
    let server = Bun.listen({
        hostname: '127.0.0.1',
        port: BACKEND,
        socket: {
            data(socket: any) {
                socket.write(reply)
            },
        },
    })
    try {
        let response = await fetch(PROXY, {signal: AbortSignal.timeout(timeout)})
        return {status: response.status, body: await response.text()}
    } catch {
        //  The proxy rejected the response and never answered
        return null
    } finally {
        server.stop(true)
        await Bun.sleep(250)
    }
}

/*
    A well framed response must be relayed intact.
 */
async function relayed(name: string, reply: string): Promise<void> {
    let result = await throughProxy(reply, 10000)
    if (result == null || result.status != 200 || !result.body.includes(BODY)) {
        console.log(name + ' expected the body to be relayed but got: ' + JSON.stringify(result))
    }
    ttrue(result != null && result.status == 200 && result.body.includes(BODY))
}

/*
    An ambiguously framed response must not be relayed. Either the proxy answers with an error, or it does
    not answer at all -- but the backend body must never reach the downstream client.
 */
async function notRelayed(name: string, reply: string): Promise<void> {
    let result = await throughProxy(reply, 2000)
    if (result != null && result.body.includes(BODY)) {
        console.log(name + ' relayed a mis-framed body: ' + JSON.stringify(result))
    }
    ttrue(result == null || !result.body.includes(BODY))
    ttrue(result == null || result.status != 200)
}

//  Controls: a correctly framed response is relayed, by either framing rule
await relayed('chunked response', `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)
await relayed('content-length response', `HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\n${BODY}`)

//  A backend that declares both framings has made the response ambiguous
await notRelayed('response TE + CL',
    `HTTP/1.1 200 OK\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)

//  Chunked does not exist in HTTP/1.0, so a 1.0 response carrying it is unframable
await notRelayed('response TE on HTTP/1.0',
    `HTTP/1.0 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)

//  Only the single coding "chunked" is understood
await notRelayed('response TE gzip, chunked',
    `HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip, chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)

//  A repeated Transfer-Encoding leaves the framing undetermined
await notRelayed('response duplicate TE',
    `HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)

//  Coding names are case insensitive on the response side too, and the proxy still works after the rejections
await relayed('response TE Chunked',
    `HTTP/1.1 200 OK\r\nTransfer-Encoding: Chunked\r\n\r\n5\r\n${BODY}\r\n0\r\n\r\n`)
