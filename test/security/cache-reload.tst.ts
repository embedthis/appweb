/*
    cache-reload.tst.ts - Check cache directives using X-Marker to identify fresh responses.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, TESTDIR, withServer} from './server'

const PORT = 4526
const URL = `http://127.0.0.1:${PORT}/cached/cgiProgram.cgi?switches=-e%20-p`

async function marker(mark: string, cacheControl: string | null): Promise<string> {
    let headers: Record<string, string> = {'X-Marker': mark}
    if (cacheControl != null) {
        headers['Cache-Control'] = cacheControl
    }
    let response = await fetch(URL, {headers})
    teq(response.status, 200)
    let body = await response.text()
    let m = body.match(/HTTP_X_MARKER=([^<\s]+)/)
    return m ? m[1] : ''
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('cache-reload', PORT, [
        'AddHandler cgiHandler cgi',
        '<Route ^/cached/>',
        '    Prefix /cached',
        `    Documents ${TESTDIR}/web`,
        '    Cache server=1hour methods=GET',
        '</Route>',
    ], async () => {
        teq(await marker('prime', null), 'prime')
        teq(await marker('replay', null), 'prime')

        let last = 'prime'
        for (let value of ['no-cache', 'no-store', 'max-age=0', 'max-age=0, no-cache', 'no-cache, max-age=0']) {
            let mark = 'fresh-' + value.replace(/[^a-z0-9]/g, '')
            let got = await marker(mark, value)
            if (got != mark) {
                console.log('Cache-Control: ' + value + ' expected a fresh response but got ' + got)
            }
            teq(got, mark)
            last = mark
        }

        for (let value of ['max-age=600', 'public', 'private', 'must-revalidate']) {
            let got = await marker('stale-' + value.replace(/[^a-z0-9]/g, ''), value)
            if (got != last) {
                console.log('Cache-Control: ' + value + ' expected the cached response ' + last + ' but got ' + got)
            }
            teq(got, last)
        }
        teq(await marker('none', null), last)

        let response = await fetch(URL, {headers: {'X-Marker': 'etag'}})
        let etag = response.headers.get('etag') || ''
        await response.text()
        ttrue(etag.startsWith('"') && etag.endsWith('"'))
        for (let value of [etag, etag.slice(1, -1), '*']) {
            let revalidate = await fetch(URL, {headers: {'X-Marker': 'etag', 'If-None-Match': value}})
            teq(revalidate.status, 304)
            await revalidate.text()
        }
        let miss = await fetch(URL, {headers: {'X-Marker': 'etag', 'If-None-Match': '"other"'}})
        teq(miss.status, 200)
        await miss.text()
    })
}
