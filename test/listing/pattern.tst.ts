/*
    pattern.tst.ts - Directory listing filter patterns match correctly and in bounded time
 */

import {teq, ttrue, tskip} from '@embedthis/testme'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from '../security/server'

const PORT = 4573
const NAME = 'listing-pattern'
const LONG = 'a'.repeat(200)

async function list(pattern: string): Promise<string> {
    let response = await fetch(`http://127.0.0.1:${PORT}/?F=0&P=${pattern}`, {signal: AbortSignal.timeout(5000)})
    teq(response.status, 200)
    return await response.text()
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    let docs = resolve(workDir(NAME), 'docs')
    await withServer(NAME, PORT, [`Documents ${docs}`, 'Options Indexes'], async () => {
        mkdirSync(docs, {recursive: true})
        for (let file of ['alpha.txt', 'beta.txt', 'abc.html', LONG]) {
            writeFileSync(resolve(docs, file), file)
        }
        let page = await list('*.txt')
        ttrue(page.includes('alpha.txt') && page.includes('beta.txt'))
        ttrue(!page.includes('abc.html'))

        page = await list('a?c*')
        ttrue(page.includes('abc.html'))
        ttrue(!page.includes('alpha.txt'))

        page = await list('*a')
        ttrue(page.includes(LONG))
        ttrue(!page.includes('alpha.txt'))

        let started = Date.now()
        let hostile = ''
        try {
            hostile = await list('*a'.repeat(24) + 'b')
        } catch {
            console.log('hostile pattern was not answered within 5 seconds')
        }
        ttrue(!hostile.includes(LONG))
        ttrue(Date.now() - started < 2000)
    })
}
