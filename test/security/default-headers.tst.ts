/*
    default-headers.tst.ts - The default security response headers
 */

import {teq, ttrue} from '@embedthis/testme'
import {withServer} from './server'
import {exchange} from './wire'

const PORT = 4597

function headers(text: string): Map<string, string> {
    let map = new Map<string, string>()
    for (let line of text.split('\r\n\r\n')[0].split('\r\n').slice(1)) {
        let i = line.indexOf(':')
        map.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim())
    }
    return map
}

async function get(path: string): Promise<Map<string, string>> {
    let reply = await exchange(PORT, `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    return headers(reply.text)
}

await withServer('default-headers', PORT, [
    '<Route ^/plain/>',
    '    Prefix /plain',
    '    Header remove Content-Security-Policy',
    '</Route>',
], async () => {
    let h = await get('/index.html')
    teq(h.get('content-security-policy'), "frame-ancestors 'self'; base-uri 'self'; object-src 'none'")
    teq(h.get('referrer-policy'), 'strict-origin-when-cross-origin')
    teq(h.get('x-frame-options'), 'SAMEORIGIN')
    teq(h.get('x-content-type-options'), 'nosniff')
    ttrue(!h.has('x-xss-protection'))
    // HSTS cannot be withdrawn once a client caches it.
    ttrue(!h.has('strict-transport-security'))

    h = await get('/plain/index.html')
    ttrue(!h.has('content-security-policy'))
    teq(h.get('x-frame-options'), 'SAMEORIGIN')
})
