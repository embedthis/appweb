/*
    cache-method.tst.ts - A server cache entry that admits several methods keys on the method
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, TESTDIR, withServer} from './server'

const PORT = 4531

async function method(path: string, m: string): Promise<string> {
    let response = await fetch(`http://127.0.0.1:${PORT}${path}/cgiProgram.cgi?switches=-e%20-p`, {method: m})
    teq(response.status, 200)
    let body = await response.text()
    let found = body.match(/REQUEST_METHOD=([A-Z]+)/)
    return found ? found[1] : ''
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('cache-method', PORT, [
        'AddHandler cgiHandler cgi',
        '<Route ^/both/>',
        '    Prefix /both',
        `    Documents ${TESTDIR}/web`,
        '    Cache server=1hour methods=GET,POST',
        '</Route>',
        '<Route ^/any/>',
        '    Prefix /any',
        `    Documents ${TESTDIR}/web`,
        '    Cache server=1hour',
        '</Route>',
    ], async () => {
        teq(await method('/both', 'GET'), 'GET')
        teq(await method('/both', 'POST'), 'POST')
        teq(await method('/both', 'GET'), 'GET')
        teq(await method('/both', 'POST'), 'POST')

        teq(await method('/any', 'GET'), 'GET')
        teq(await method('/any', 'POST'), 'POST')
        teq(await method('/any', 'GET'), 'GET')
    })
}
