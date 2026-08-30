/*
    cors-policy.tst - CORS origin selection and credential policy
 */

import {tget, ttrue} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

const CORS = new Uri(tget('TM_HTTP') || 'http://127.0.0.1:4100')
const HOST = CORS.host

async function request(path: string, origin: string | null): Promise<string> {
    let s = new Socket
    let response = new ByteArray(8192)
    let headers = `GET ${path} HTTP/1.1\r\nHost: ${HOST}\r\n`

    if (origin != null) {
        headers += `Origin: ${origin}\r\n`
    }
    s.connect(CORS.address)
    try {
        await s.write(headers + '\r\n')
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

function hasHeader(response: string, key: string, value: string): boolean {
    return response.includes(`${key}: ${value}\r\n`)
}

let response = await request('/cors-token', 'https://a.example')
ttrue(response.includes('200 OK'))
ttrue(hasHeader(response, 'Access-Control-Allow-Origin', 'https://a.example'))
ttrue(hasHeader(response, 'Access-Control-Allow-Credentials', 'true'))
ttrue(hasHeader(response, 'Vary', 'Origin'))

response = await request('/cors-token', 'https://b.example')
ttrue(response.includes('200 OK'))
ttrue(!response.includes('Access-Control-Allow-Origin:'))
ttrue(!response.includes('Access-Control-Allow-Credentials:'))

response = await request('/cors-client', 'https://client.example')
ttrue(response.includes('200 OK'))
ttrue(hasHeader(response, 'Access-Control-Allow-Origin', 'https://client.example'))
ttrue(hasHeader(response, 'Vary', 'Origin'))
ttrue(!response.includes('Access-Control-Allow-Credentials:'))

response = await request('/cors-client', null)
ttrue(response.includes('200 OK'))
ttrue(hasHeader(response, 'Access-Control-Allow-Origin', '*'))

response = await request('/cors-all', 'https://any.example')
ttrue(response.includes('200 OK'))
ttrue(hasHeader(response, 'Access-Control-Allow-Origin', '*'))
