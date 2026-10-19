/*
    cache-encoding.tst.ts - A cached gzip variant is not replayed to a client that did not accept gzip
 */

import {teq, ttrue, tskip} from '@embedthis/testme'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {gzipSync} from 'node:zlib'
import {BIN, withServer, workDir} from './server'
import {body, exchange, status} from './wire'

const PORT = 4577
const NAME = 'cache-encoding'

async function get(encoding: string): Promise<{line: string, head: string, body: string}> {
    let request = `GET /page.html HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept-Encoding: ${encoding}\r\nConnection: close\r\n\r\n`
    let reply = await exchange(PORT, request, 5000)
    return {line: status(reply), head: reply.text.split('\r\n\r\n')[0], body: body(reply)}
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    let docs = resolve(workDir(NAME), 'docs')
    await withServer(NAME, PORT, [`Documents ${docs}`, 'Map compressed', 'Cache server=1hour methods=GET'], async () => {
        mkdirSync(docs, {recursive: true})
        writeFileSync(resolve(docs, 'page.html'), 'PLAIN VARIANT')
        writeFileSync(resolve(docs, 'page.html.gz'), gzipSync('COMPRESSED VARIANT'))

        let r = await get('gzip')
        ttrue(/ 200 /.test(r.line))
        ttrue(/content-encoding: gzip/i.test(r.head))

        r = await get('identity')
        ttrue(/ 200 /.test(r.line))
        if (/content-encoding/i.test(r.head) || !r.body.includes('PLAIN VARIANT')) {
            console.log('identity client got:\n' + r.head + '\n\n' + r.body)
        }
        ttrue(!/content-encoding/i.test(r.head))
        ttrue(r.body.includes('PLAIN VARIANT'))

        r = await get('gzip')
        ttrue(/content-encoding: gzip/i.test(r.head))
        r = await get('identity')
        teq(r.body.includes('PLAIN VARIANT'), true)
    })
}
