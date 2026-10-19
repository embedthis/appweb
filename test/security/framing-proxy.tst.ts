/* A hostile backend response must reach the client as a defined outcome */

import {tget, tskip, ttrue} from '@embedthis/testme'
import {Config, Uri} from '@embedthis/ejscript'

/*
    The proxy handler is ME_UNIX_LIKE only: proxyHandler.c compiles to nothing elsewhere, so
    conditionalDefinition reports PROXY_MODULE false and the <if PROXY_MODULE> block that declares the
    /badproxy/ route this drives is not read. Without the skip every case here fails with a 404 from
    the default route, which reads as a framing defect rather than an absent handler.
 */
if (Config.OS == 'windows') {
    tskip('the proxy handler is not built on Windows, so the /badproxy/ route does not exist')
    process.exit(0)
}

const HTTP = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
const PROXY = `http://${HTTP.host}:${HTTP.port}/badproxy/x`
const BACKEND = 9997
const BODY = 'HELLO'


interface Result {
    status: number
    headers: Headers
    body: string
}

async function throughProxy(reply: string, timeout: number): Promise<Result | null> {
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
        let response = await fetch(PROXY, {redirect: 'manual', signal: AbortSignal.timeout(timeout)})
        return {status: response.status, headers: response.headers, body: await response.text()}
    } catch {
        return null
    } finally {
        server.stop(true)
        await Bun.sleep(250)
    }
}

/*
    A well framed response must be relayed intact.
 */
async function relayed(name: string, reply: string, status = 200): Promise<Result | null> {
    let result = await throughProxy(reply, 10000)
    if (result == null || result.status != status || !result.body.includes(BODY)) {
        console.log(name + ' expected the body to be relayed but got: ' + JSON.stringify(result))
    }
    ttrue(result != null && result.status == status && result.body.includes(BODY))
    return result
}

async function notRelayed(name: string, reply: string): Promise<Result | null> {
    let result = await throughProxy(reply, 2000)
    if (result == null || result.status != 502 || result.body.includes(BODY)) {
        console.log(name + ' expected a prompt 502 without the body but got: ' + JSON.stringify(result))
    }
    ttrue(result != null && result.status == 502)
    ttrue(result == null || !result.body.includes(BODY))
    return result
}

function withStatus(line: string, headers = ''): string {
    return `${line}\r\nContent-Length: 5\r\n${headers}\r\n${BODY}`
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


let result = await notRelayed('header value with bare CR', withStatus('HTTP/1.1 200 OK', 'X-Test: aaa\rbbb\r\n'))
ttrue(result == null || result.headers.get('X-Test') == null)

//  Unlike a CGI header, a CR before the CRLF is not trimmed: it is still a bare CR (RFC 9112 2.2)
result = await notRelayed('header value with trailing CR', withStatus('HTTP/1.1 200 OK', 'X-Test: aaa\r\r\n'))
ttrue(result == null || result.headers.get('X-Test') == null)


result = await relayed('CRLF in header value', withStatus('HTTP/1.1 200 OK', 'X-Test: a\r\nX-Injected: 1\r\n'))
ttrue(result != null && result.headers.get('X-Test') == 'a' && result.headers.get('X-Injected') == '1')

for (const code of [404, 503, 599]) {
    await relayed(`status ${code}`, withStatus(`HTTP/1.1 ${code} Reason`), code)
}

//  The reason phrase is optional (RFC 9112 4), so an empty one is relayed
await relayed('status with empty reason', withStatus('HTTP/1.1 201 '), 201)

for (const bad of ['999', '0', '-1', '99', '600', 'abc', '2147483648', '2000', '20', '200x']) {
    await notRelayed(`status "${bad}"`, withStatus(`HTTP/1.1 ${bad} Reason`))
}


result = await relayed('off-host Location', withStatus('HTTP/1.1 302 Found', 'Location: http://elsewhere.example/x\r\n'), 302)
ttrue(result != null && result.headers.get('Location') == 'http://elsewhere.example/x')

await relayed('final control', withStatus('HTTP/1.1 200 OK'))
