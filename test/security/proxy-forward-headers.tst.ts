/*
    Verify forwarding headers identify the real client, hop-by-hop headers are removed, and consumed credentials
    stay out of backend requests.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {Config} from '@embedthis/ejscript'
import {BACKEND, exchange, statusOf} from './proxy'

const JOSHUA = 'Authorization: Basic ' + Buffer.from('joshua:pass1').toString('base64') + '\r\n'
const OK = 'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK'

if (Config.OS == 'windows') {
    tskip('the proxy handler is not built on Windows, so the /authproxy/ routes do not exist')
    process.exit(0)
}

type Headers = Record<string, string[]>

let received: Headers[] = []
let reply = OK
let server = Bun.listen({
    hostname: '127.0.0.1',
    port: BACKEND,
    socket: {
        data(socket: any, data: Buffer) {
            let head = data.toString('latin1').split('\r\n\r\n')[0]
            let headers: Headers = {}
            for (let line of head.split('\r\n').slice(1)) {
                let colon = line.indexOf(':')
                if (colon > 0) {
                    let key = line.slice(0, colon).trim().toLowerCase()
                    ;(headers[key] = headers[key] || []).push(line.slice(colon + 1).trim())
                }
            }
            received.push(headers)
            socket.write(reply)
        },
    },
})

//  Headers the backend received for one request, or null if it was not reached
async function forward(target: string, headers = '', connection = 'close'): Promise<Headers | null> {
    received = []
    lastResponse = await exchange(`GET ${target} HTTP/1.1\r\nHost: t\r\nConnection: ${connection}\r\n${headers}\r\n`)
    let status = statusOf(lastResponse)
    if (status != 200 || received.length != 1) {
        console.log(`${target} answered ${status}, backend saw ${received.length} request(s)`)
        return null
    }
    return received[0]
}

let lastResponse = ''

function one(headers: Headers, key: string): string | undefined {
    return headers[key] ? headers[key].join(', ') : undefined
}

try {
    let got = await forward('/authproxy/x', 'X-Forwarded-For: 192.0.2.1\r\nForwarded: for=6.6.6.6;proto=https\r\n' +
        'X-Forwarded-Host: evil.example\r\nX-Forwarded-Proto: https\r\nX-Real-IP: 6.6.6.6\r\nX-Hostname: evil\r\n' +
        'X-Canonical: https://evil.example\r\nX-Client: 6.6.6.6\r\n')
    ttrue(got != null)
    if (got) {
        let peer = one(got, 'x-client')
        if (one(got, 'x-forwarded-for') != `192.0.2.1, ${peer}`) {
            console.log('forwarded headers: ' + JSON.stringify(got))
        }
        ttrue(peer != null && !peer.includes('6.6.6.6') && got['x-client'].length == 1)
        ttrue(one(got, 'x-forwarded-for') == `192.0.2.1, ${peer}`)
        ttrue(one(got, 'x-real-ip') == peer)
        ttrue(one(got, 'x-forwarded-proto') == 'http')
        ttrue(got['forwarded'] == null)
        ttrue(got['x-forwarded-host'] == null)
        ttrue(one(got, 'x-hostname') != 'evil')

        ttrue(one(got, 'x-canonical') == 'http://127.0.0.1:4100')
    }

    got = await forward('/authproxy/x')
    ttrue(got != null && one(got, 'x-forwarded-for') == one(got, 'x-client'))

    got = await forward('/authproxy/x', 'Proxy-Authorization: Basic cDpw\r\nKeep-Alive: timeout=5\r\nTE: trailers\r\n' +
        'Proxy-Connection: keep-alive\r\nTrailer: X-Sum\r\nX-Drop: 1\r\nX-Keep: 1\r\n', 'close, x-drop')
    ttrue(got != null)
    if (got) {
        for (let key of ['proxy-authorization', 'keep-alive', 'te', 'proxy-connection', 'trailer', 'x-drop']) {
            if (got[key]) {
                console.log(`hop-by-hop ${key} reached the backend`)
            }
            ttrue(got[key] == null)
        }
        ttrue(one(got, 'x-keep') == '1')
    }

    reply = 'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nKeep-Alive: timeout=5\r\nProxy-Authenticate: Basic\r\n' +
        'X-Back: 1\r\n\r\nOK'
    got = await forward('/authproxy/x')
    reply = OK
    let head = lastResponse.split('\r\n\r\n')[0].toLowerCase()
    ttrue(got != null && head.includes('x-back: 1'))
    ttrue(!head.includes('proxy-authenticate') && !head.includes('keep-alive: timeout=5'))

    let cookies = 'Cookie: theme=dark; -http-session-=abc; lang=en\r\n'
    got = await forward('/authproxy/admin/x', JOSHUA + cookies)
    ttrue(got != null)
    if (got) {
        if (got['authorization'] || one(got, 'cookie') != 'theme=dark; lang=en') {
            console.log('authenticated route forwarded: ' + JSON.stringify(got))
        }
        ttrue(got['authorization'] == null)
        ttrue(one(got, 'cookie') == 'theme=dark; lang=en')
    }

    got = await forward('/authproxy/x', JOSHUA + cookies)
    ttrue(got != null && one(got, 'authorization') == JOSHUA.slice(15, -2))
    ttrue(got != null && one(got, 'cookie') == 'theme=dark; -http-session-=abc; lang=en')
} finally {
    server.stop(true)
    await Bun.sleep(250)
}
