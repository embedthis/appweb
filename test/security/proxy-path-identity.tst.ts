/* The proxy must forward the decoded, dot-normalized path used for routing and authorization. */

import {tskip, ttrue} from '@embedthis/testme'
import {Config} from '@embedthis/ejscript'
import {BACKEND, exchange, statusOf} from './proxy'

if (Config.OS == 'windows') {
    tskip('the proxy handler is not built on Windows, so the /authproxy/ routes do not exist')
    process.exit(0)
}

const JOSHUA = 'Authorization: Basic ' + Buffer.from('joshua:pass1').toString('base64') + '\r\n'

let lines: string[] = []
let server = Bun.listen({
    hostname: '127.0.0.1',
    port: BACKEND,
    socket: {
        data(socket: any, data: Buffer) {
            for (let line of data.toString('latin1').split('\r\n')) {
                if (/^[A-Z]+ \S+ HTTP\/1\.[01]$/.test(line)) {
                    lines.push(line)
                }
            }
            socket.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
        },
    },
})

//  Forwarded request line for a target, or null if the backend was not reached
async function forwarded(target: string, headers = ''): Promise<{status: number; line: string | null}> {
    lines = []
    let status = statusOf(await exchange(`GET ${target} HTTP/1.1\r\nHost: t\r\nConnection: close\r\n${headers}\r\n`))
    return {status, line: lines.length ? lines[0] : null}
}

try {
    let result = await forwarded('/authproxy/admin/x')
    ttrue(result.status == 401 && result.line == null)

    //  Spellings that leave the protected prefix: none may reach the backend under /admin
    for (let target of ['/authproxy/admin/../public/x', '/authproxy/admin/%2e%2e/public/x',
            '/authproxy/admin%2f..%2fpublic/x']) {
        result = await forwarded(target)
        if (result.line && result.line.startsWith('GET /admin')) {
            console.log(`${target} reached the backend as "${result.line}"`)
        }
        ttrue(!(result.line && result.line.startsWith('GET /admin')))
    }
    result = await forwarded('/authproxy/admin/../public/x')
    ttrue(result.line == 'GET /public/x HTTP/1.1')

    result = await forwarded('/authproxy/admin/x', JOSHUA)
    if (result.status != 200 || result.line != 'GET /admin/x HTTP/1.1') {
        console.log('authorized request: ' + JSON.stringify(result))
    }
    ttrue(result.status == 200 && result.line == 'GET /admin/x HTTP/1.1')

    //  Characters that are not literal in a path are re-encoded, and the query is kept
    result = await forwarded('/authproxy/a%20b')
    ttrue(result.line == 'GET /a%20b HTTP/1.1')
    result = await forwarded('/authproxy/a%3Fb?q=1')
    ttrue(result.line == 'GET /a%3Fb?q=1 HTTP/1.1')
    result = await forwarded('/authproxy/100%25')
    ttrue(result.line == 'GET /100%25 HTTP/1.1')
} finally {
    server.stop(true)
    await Bun.sleep(250)
}
