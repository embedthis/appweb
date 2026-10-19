/*
    sensitive-files.tst.ts - Version control, backup and editor files are not served
 */

import {teq, ttrue} from '@embedthis/testme'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {TESTDIR, withServer} from './server'
import {body, exchange, status} from './wire'

const PORT = 4592
const DOCS = resolve(TESTDIR, 'tmp/sensitive-docs')

const DENIED = ['/.git/HEAD', '/.env', '/index.html.bak', '/index.html~', '/secret.orig', '/sub/.svn/entries',
    '/.DS_Store', '/notes.swp']
const SERVED = ['/index.html', '/legit.git.html', '/.well-known/acme-challenge/tok']

async function get(path: string): Promise<{code: string, text: string}> {
    let reply = await exchange(PORT, `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    return {code: status(reply).split(' ')[1] || '', text: body(reply)}
}

rmSync(DOCS, {recursive: true, force: true})
for (let path of [...DENIED, ...SERVED]) {
    mkdirSync(resolve(DOCS, '.' + path, '..'), {recursive: true})
    writeFileSync(resolve(DOCS, '.' + path), 'content ' + path)
}
try {
    await withServer('sensitive-files', PORT, [`Documents ${DOCS}`], async () => {
        let missing = await get('/no-such-file.html')
        teq(missing.code, '404')
        for (let path of DENIED) {
            let reply = await get(path)
            if (reply.code != '404') {
                console.log(`${path} answered ${reply.code}`)
            }
            teq(reply.code, '404')
            teq(reply.text, missing.text)
        }
        for (let path of SERVED) {
            let reply = await get(path)
            if (reply.code != '200') {
                console.log(`${path} answered ${reply.code}`)
            }
            teq(reply.code, '200')
        }
    })
    await withServer('sensitive-files-served', PORT, [`Documents ${DOCS}`, 'ServeSensitiveFiles on'], async () => {
        teq((await get('/index.html.bak')).code, '200')
        teq((await get('/.git/HEAD')).code, '200')
    })
} finally {
    rmSync(DOCS, {recursive: true, force: true})
}
