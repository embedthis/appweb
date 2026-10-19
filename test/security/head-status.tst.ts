/*
    head-status.tst.ts - HEAD framing on 204, 304 and error responses
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, withServer} from './server'

const PORT = 4530

interface Reply {
    head: string
    body: string
}

function header(head: string, name: string): string | null {
    for (let line of head.split('\r\n')) {
        let colon = line.indexOf(':')
        if (colon > 0 && line.slice(0, colon).trim().toLowerCase() == name) {
            return line.slice(colon + 1).trim()
        }
    }
    return null
}

// Read to EOF to capture the exact response body.
async function request(method: string, path: string, extra = ''): Promise<Reply> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let data = ''
        socket.on('connect', () => {
            socket.write(`${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\n${extra}Connection: close\r\n\r\n`)
        })
        socket.on('data', chunk => { data += chunk.toString() })
        socket.on('close', () => {
            let i = data.indexOf('\r\n\r\n')
            resolvePromise({head: i >= 0 ? data.slice(0, i) : data, body: i >= 0 ? data.slice(i + 4) : ''})
        })
        socket.on('error', reject)
    })
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('head-status', PORT, [
        '<Route ^/empty>',
        '    Target write 204 ""',
        '</Route>',
    ], async () => {
        for (let method of ['GET', 'HEAD']) {
            let r = await request(method, '/empty')
            ttrue(r.head.includes(' 204 '), method + ' /empty must be 204: ' + r.head)
            teq(header(r.head, 'content-length'), null)
            teq(r.body, '')
        }

        let base = await request('GET', '/index.html')
        ttrue(base.head.includes(' 200 '))
        let etag = header(base.head, 'etag')
        let modified = header(base.head, 'last-modified')
        ttrue(etag != null && modified != null)
        for (let [method, extra] of [
            ['HEAD', 'If-None-Match: ' + etag + '\r\n'],
            ['HEAD', 'If-Modified-Since: ' + modified + '\r\n'],
            ['GET', 'If-None-Match: ' + etag + '\r\n'],
        ]) {
            let r = await request(method, '/index.html', extra)
            ttrue(r.head.includes(' 304 '), method + ' with ' + extra.trim() + ' must be 304: ' + r.head)
            teq(header(r.head, 'content-length'), null)
            teq(r.body, '')
        }

        let head = await request('HEAD', '/index.html')
        ttrue(head.head.includes(' 200 '))
        teq(header(head.head, 'content-length'), header(base.head, 'content-length'))
        teq(head.body, '')

        let missing = await request('HEAD', '/no-such-document.html')
        ttrue(missing.head.includes(' 404 '))
        ttrue(Number(header(missing.head, 'content-length')) > 0)
        teq(missing.body, '')
        let get = await request('GET', '/no-such-document.html')
        ttrue(get.head.includes(' 404 '))
        teq(get.body.length, Number(header(get.head, 'content-length')))
        teq(header(missing.head, 'content-length'), header(get.head, 'content-length'))
    })
}
