/*
    stderr.tst.ts - What a CGI program writes to stderr is logged, never sent to the client
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from '../security/server'
import {dechunk} from '../security/raw'
import {body, exchange, status} from '../security/wire'

const PORT = 4561
const NAME = 'cgi-stderr'
const SECRET = 'SENTINEL-/srv/app/secret.py-line-42'

function script(dir: string, name: string, text: string): void {
    let path = resolve(dir, name)
    writeFileSync(path, '#!/bin/sh\n' + text)
    chmodSync(path, 0o755)
}

async function get(path: string) {
    return await exchange(PORT, `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
}

function expectStatus(name: string, reply: any, expected: string): void {
    let ok = status(reply).includes(expected)
    if (!ok) {
        console.log(`${name}.cgi: expected ${expected}, got ${JSON.stringify(reply.text.slice(0, 400))}`)
    }
    ttrue(ok)
}

if (process.platform == 'win32') {
    tskip('Skip test -- the CGI programs are POSIX shell scripts')
} else {
    let work = workDir(NAME)
    //  The documents exist before the server starts, so they live outside its work directory
    let docs = workDir(NAME + '-docs')
    rmSync(docs, {recursive: true, force: true})
    mkdirSync(docs, {recursive: true})
    // Write stderr first so the handler reads it before stdout.
    script(docs, 'warn.cgi',
        `echo "${SECRET}" >&2\nsleep 0.2\nprintf 'Content-Type: text/plain\\r\\n\\r\\nall good\\n'\n`)
    script(docs, 'mixed.cgi', `printf 'Content-Type: text/plain\\r\\n\\r\\n'\necho "${SECRET}" >&2\nsleep 0.2\n` +
        `echo 'body text'\n`)
    script(docs, 'fail.cgi', `echo "${SECRET}" >&2\nexit 1\n`)
    script(docs, 'silent.cgi', 'exit 0\n')
    script(docs, 'forge.cgi', `printf 'x\\r\\n09/25/26 00:00:00 0 info FORGED-LOG-LINE\\n' >&2\nsleep 0.2\n` +
        `printf 'Content-Type: text/plain\\r\\n\\r\\nok\\n'\n`)

    await withServer(NAME, PORT, [
        `Documents ${docs}`,
        'AddHandler cgiHandler cgi',
    ], async () => {
        let warn = await get('/warn.cgi')
        expectStatus('warn', warn, '200 OK')
        teq(dechunk(warn.text).split('\r\n\r\n')[1], 'all good\n')
        ttrue(!warn.text.includes('SENTINEL'))

        let mixed = await get('/mixed.cgi')
        expectStatus('mixed', mixed, '200 OK')
        teq(dechunk(mixed.text).split('\r\n\r\n')[1], 'body text\n')
        ttrue(!mixed.text.includes('SENTINEL'))

        let fail = await get('/fail.cgi')
        ttrue(!fail.text.includes('SENTINEL'))
        expectStatus('fail', fail, '502 Bad Gateway')

        let silent = await get('/silent.cgi')
        expectStatus('silent', silent, '502 Bad Gateway')

        let forge = await get('/forge.cgi')
        expectStatus('forge', forge, '200 OK')
        ttrue(!forge.text.includes('FORGED'))

        let log = readFileSync(resolve(work, 'trace.log'), 'utf8')
        ttrue(log.includes(SECRET))
        ttrue(!/(^|\n)09\/25\/26 00:00:00 0 info FORGED-LOG-LINE/.test(log))
    })
    rmSync(docs, {recursive: true, force: true})
}
