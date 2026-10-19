/*
    badUrl.tst.ts - Stress test malformed URL handling
 */

import {tget, ttrue} from '@embedthis/testme'
import net from 'node:net'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const target = HTTP.replace(/^https?:\/\//, '')
const [HOST, port] = target.split(':')
const PORT = parseInt(port || '80')

//  Send a raw request line and return whatever the server says before it closes
async function rawRequest(line: string): Promise<string> {
    return await new Promise((resolvePromise) => {
        let socket = net.connect(PORT, HOST)
        let response = ''
        /*
            A rejected request line may draw no response and no close -- the server simply stops
            reading. Two seconds is far longer than the millisecond a real answer takes, and short
            enough that the silent cases do not dominate the run.
         */
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(response)
        }, 2000)

        socket.on('connect', () => socket.write(line))
        socket.on('data', chunk => response += chunk.toString())
        socket.on('close', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
        socket.on('error', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
    })
}

//  A sane request on the same path, to prove the endpoint and the raw-socket path both work.
//  Without this the malformed cases below would pass just as well against a dead server.
let ok = await rawRequest('GET /index.html HTTP/1.0\r\n\r\n')
ttrue(ok.includes('200 OK'))

/*
    Control characters in the URI. Each must be refused: a 400, or a closed connection with no
    status at all. What must not happen is a 200 -- that would mean the byte was routed.
 */
for (let bad of ['\x01', '\x00', '\x07', '\x1f']) {
    let response = await rawRequest('GET /index' + bad + '.html HTTP/1.0\r\n\r\n')
    ttrue(!response.includes('200 OK'))
    if (response != '') {
        ttrue(response.includes('400') || response.includes('Bad Request'))
    }
}
