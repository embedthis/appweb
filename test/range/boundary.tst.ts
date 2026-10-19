/*
    boundary.tst.ts - A 206 body carries the bytes its Content-Range names
 */

import {teq, ttrue} from '@embedthis/testme'
import {mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from '../security/server'
import {dechunk} from '../security/raw'
import {exchange, status} from '../security/wire'

const PORT = 4566
const NAME = 'range-boundary'
const SIZE = 100000

// Each eight-byte cell identifies its offset.
let content = ''
for (let i = 0; content.length < SIZE; i += 8) {
    content += i.toString(16).padStart(8, '0')
}
content = content.slice(0, SIZE)

async function range(spec: string) {
    let reply = await exchange(PORT, `GET /file.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=${spec}\r\n` +
        'Connection: close\r\n\r\n', 5000)
    let end = reply.text.indexOf('\r\n\r\n')
    let header = /\r\nContent-Range: ([^\r]*)/i.exec(reply.text.slice(0, end))
    let body = reply.text.slice(end + 4)
    if (/\r\nTransfer-Encoding: chunked/i.test(reply.text.slice(0, end))) {
        body = dechunk(reply.text).slice(end + 4)
    }
    return {status: status(reply), range: header ? header[1] : '', body}
}

let docs = resolve(workDir(NAME), 'docs')

await withServer(NAME, PORT, [`Documents ${docs}`], async () => {
    mkdirSync(docs, {recursive: true})
    writeFileSync(resolve(docs, 'file.txt'), content)

    for (let start of [4096, 8192, 16384, 16383, 16385, 32768, 65536]) {
        let r = await range(`${start}-${start + 99}`)
        let ok = r.status.includes('206') && r.range == `bytes ${start}-${start + 99}/${SIZE}` &&
            r.body == content.slice(start, start + 100)
        if (!ok) {
            console.log(`bytes=${start}-${start + 99}: ${r.status} ${r.range} body starts ` +
                JSON.stringify(r.body.slice(0, 16)))
        }
        ttrue(ok)
    }

    for (let suffix of [SIZE, SIZE + 1, SIZE * 2]) {
        let r = await range(`-${suffix}`)
        ttrue(r.status.includes('206'))
        teq(r.range, `bytes 0-${SIZE - 1}/${SIZE}`)
        ttrue(r.body == content)
    }

    let tail = await range('-10')
    teq(tail.range, `bytes ${SIZE - 10}-${SIZE - 1}/${SIZE}`)
    ttrue(tail.body == content.slice(SIZE - 10))

    for (let spec of ['-0', `${SIZE}-`, `${SIZE}-${SIZE + 5}`]) {
        let r = await range(spec)
        if (!r.status.includes('416')) {
            console.log(`bytes=${spec}: expected 416, got ${r.status} ${r.range}`)
        }
        ttrue(r.status.includes('416'))
    }

    let last = await range(`${SIZE - 1}-`)
    teq(last.range, `bytes ${SIZE - 1}-${SIZE - 1}/${SIZE}`)
    ttrue(last.body == content.slice(SIZE - 1))
})
