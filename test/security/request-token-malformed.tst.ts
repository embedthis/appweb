/*
    request-token-malformed.tst - Malformed request token expansion must not crash or spin

    A reflected Origin header on a CrossOrigin route reaches httpExpandVars. Unterminated
    or namespace-less ${...} sequences must be emitted literally and must complete.
 */

import {tget, ttrue} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

const CORS = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
const HOST = CORS.host
const PATH = '/cors-client'

async function request(origin: string): Promise<string> {
    let s = new Socket
    let response = new ByteArray(8192)
    s.connect(CORS.address)
    try {
        await s.write(`GET ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nOrigin: ${origin}\r\n\r\n`)
        for (let i = 0; i < 8 && !response.toString().includes('\r\n\r\n'); i++) {
            if ((await s.read(response, -1)) == null) {
                break
            }
        }
    } finally {
        s.close()
    }
    return response.toString()
}

async function check(origin: string, expected: string = origin): Promise<void> {
    let response = await request(origin)
    if (!response.includes('200 OK') || !response.includes(`Access-Control-Allow-Origin: ${expected}\r\n`)) {
        console.log(`Origin ${origin} produced:\n${response}`)
    }
    ttrue(response.includes('200 OK'))
    ttrue(response.includes(`Access-Control-Allow-Origin: ${expected}\r\n`))
}

await check('${')
await check('${x')
await check('${a.b')
await check('${a:b')
await check('$')
await check('${}')
await check('${request:uri}', PATH)
await check('https://ok.example')
