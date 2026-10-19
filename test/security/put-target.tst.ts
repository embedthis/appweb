/*
    put-target.tst.ts - PUT writes only to a regular file inside the documents
 */

import {teq, ttrue} from '@embedthis/testme'
import {execSync} from 'node:child_process'
import {existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'
import {exchange, status} from './wire'

const PORT = 4562
const NAME = 'put-target'
const ORIGINAL = 'outside content must survive\n'

async function put(path: string, data: string, extra: string[] = []) {
    let request = [`PUT ${path} HTTP/1.1`, 'Host: 127.0.0.1', `Content-Length: ${data.length}`, ...extra,
        'Connection: close', '', data].join('\r\n')
    return await exchange(PORT, request, 5000)
}

function refused(name: string, reply: any): void {
    let line = status(reply)
    let ok = /^HTTP\/1.1 [45]\d\d/.test(line) && reply.elapsed < 3000
    if (!ok) {
        console.log(`${name}: expected a prompt refusal, got "${line}" after ${reply.elapsed}ms`)
    }
    ttrue(ok)
}

let work = workDir(NAME)
let docs = resolve(work, 'docs')
let outside = resolve(work, 'outside.txt')

await withServer(NAME, PORT, [
    `Documents ${docs}`,
    'Methods add PUT',
], async () => {
    mkdirSync(docs, {recursive: true})
    writeFileSync(outside, ORIGINAL)
    symlinkSync(outside, resolve(docs, 'link.txt'))
    //  Windows has no FIFOs
    let fifo = process.platform != 'win32'
    if (fifo) {
        execSync(`mkfifo ${resolve(docs, 'pipe.txt')}`)
    }
    writeFileSync(resolve(docs, 'existing.txt'), 'old content that is longer than the new\n')

    refused('symlink', await put('/link.txt', 'overwritten\n'))
    teq(readFileSync(outside, 'utf8'), ORIGINAL)

    refused('ranged symlink', await put('/link.txt', 'XX', ['Content-Range: bytes 0-1/2']))
    teq(readFileSync(outside, 'utf8'), ORIGINAL)

    if (fifo) {
        refused('fifo', await put('/pipe.txt', 'into the pipe\n'))
    }

    let replaced = await put('/existing.txt', 'new\n')
    ttrue(status(replaced).includes('204'))
    teq(readFileSync(resolve(docs, 'existing.txt'), 'utf8'), 'new\n')

    let created = await put('/created.txt', 'fresh\n')
    ttrue(status(created).includes('201'))
    ttrue(existsSync(resolve(docs, 'created.txt')))
    teq(readFileSync(resolve(docs, 'created.txt'), 'utf8'), 'fresh\n')

    let ranged = await put('/existing.txt', 'NE', ['Content-Range: bytes 0-1/4'])
    ttrue(/^HTTP\/1.1 20\d/.test(status(ranged)))
    teq(readFileSync(resolve(docs, 'existing.txt'), 'utf8'), 'NEw\n')
})
