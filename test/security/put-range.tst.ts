/*
    put-range.tst.ts - A PUT with Content-Range patches an existing file within its current size
 */

import {teq, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'
import {exchange, status} from './wire'

const PORT = 4574
const NAME = 'put-range'

async function put(path: string, data: string, extra: string[] = []): Promise<string> {
    let request = [`PUT ${path} HTTP/1.1`, 'Host: 127.0.0.1', `Content-Length: ${data.length}`, ...extra,
        'Connection: close', '', data].join('\r\n')
    return status(await exchange(PORT, request, 10000))
}

let docs = resolve(workDir(NAME), 'docs')
let file = resolve(docs, 'f.txt')
let original = Array.from({length: 1000}, (_, i) => String(i % 10)).join('')

await withServer(NAME, PORT, [`Documents ${docs}`, 'Methods add PUT'], async () => {
    mkdirSync(docs, {recursive: true})

    writeFileSync(file, original)
    ttrue(/ 204 /.test(await put('/f.txt', 'X'.repeat(100), ['Content-Range: bytes 100-199/1000'])))
    let content = readFileSync(file, 'utf8')
    teq(content.length, 1000)
    teq(content.slice(0, 100), original.slice(0, 100))
    teq(content.slice(100, 200), 'X'.repeat(100))
    teq(content.slice(200), original.slice(200))

    let big = 'b'.repeat(200000)
    writeFileSync(file, 'a'.repeat(300000))
    ttrue(/ 204 /.test(await put('/f.txt', big, [`Content-Range: bytes 1000-200999/300000`])))
    content = readFileSync(file, 'utf8')
    teq(content.length, 300000)
    teq(content.slice(0, 1000), 'a'.repeat(1000))
    teq(content.slice(1000, 201000), big)
    teq(content.slice(201000), 'a'.repeat(99000))

    writeFileSync(file, original)
    let line = await put('/f.txt', 'ABCDEF',
        ['Content-Range: bytes 9223372036854775000-9223372036854775005/9223372036854775807'])
    ttrue(/ 416 /.test(line))
    teq(statSync(file).size, 1000)
    ttrue(/ 416 /.test(await put('/f.txt', 'AB', ['Content-Range: bytes 5000-5001/6000'])))
    teq(statSync(file).size, 1000)

    ttrue(/ 416 /.test(await put('/missing.txt', 'AB', ['Content-Range: bytes 0-1/2'])))
    ttrue(!existsSync(resolve(docs, 'missing.txt')))

    ttrue(/ 204 /.test(await put('/f.txt', 'whole', ['Range: bytes=0-0'])))
    teq(readFileSync(file, 'utf8'), 'whole')
})
