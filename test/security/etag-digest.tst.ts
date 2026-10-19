/*
    etag-digest.tst.ts - A file's ETag is a digest of its identity, not a sum that discloses it
 */

import {teq, ttrue} from '@embedthis/testme'
import {statSync, writeFileSync, mkdirSync, renameSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'
import {exchange} from './wire'

const PORT = 4567
const NAME = 'etag-digest'

async function head(path: string, extra = '') {
    let reply = await exchange(PORT, `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\n${extra}Connection: close\r\n\r\n`)
    let field = (name: string) => {
        let m = new RegExp(`\\r\\n${name}: ([^\\r]*)`, 'i').exec(reply.text)
        return m ? m[1] : ''
    }
    return {status: reply.text.split('\r\n')[0], etag: field('ETag'), length: field('Content-Length'),
        modified: field('Last-Modified')}
}

let docs = resolve(workDir(NAME), 'docs')

await withServer(NAME, PORT, [`Documents ${docs}`], async () => {
    mkdirSync(docs, {recursive: true})
    let file = resolve(docs, 'file.txt')
    writeFileSync(file, 'first version of the content\n')

    let a = await head('/file.txt')
    ttrue(/^"[0-9a-f]{32}"$/.test(a.etag))

    let info = statSync(file)
    let sum = info.ino + info.size + Math.floor(info.mtimeMs / 1000)
    ttrue(!a.etag.includes(String(sum)))
    ttrue(!a.etag.includes(String(info.ino)))

    let again = await head('/file.txt')
    teq(again.etag, a.etag)
    let cached = await head('/file.txt', `If-None-Match: ${a.etag}\r\n`)
    ttrue(cached.status.includes('304'))

    // Replace within the same second to test inode and size changes.
    let next = resolve(docs, 'next.tmp')
    writeFileSync(next, 'second version\n')
    renameSync(next, file)
    let b = await head('/file.txt')
    ttrue(b.etag != a.etag)
    let stale = await head('/file.txt', `If-None-Match: ${a.etag}\r\n`)
    ttrue(stale.status.includes('200'))
})
