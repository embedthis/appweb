/*
    methods-default.tst.ts - The default route method set matches what sample.conf documents

    A route without a Methods directive admits GET and POST, and HEAD through GET. OPTIONS is not in the default
    set: it is refused unless the route adds it, as CrossOrigin does for pre-flight requests.
 */

import {teq, tget, ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

for (let method of ['GET', 'HEAD', 'POST']) {
    let response = await fetch(`${HTTP}/index.html`, {method})
    teq(response.status, 200)
}

let options = await fetch(`${HTTP}/index.html`, {method: 'OPTIONS'})
ttrue(options.status >= 400)

let preflight = await fetch(`${HTTP}/cors-all`, {
    method: 'OPTIONS',
    headers: {'Origin': 'https://a.example', 'Access-Control-Request-Method': 'GET'},
})
teq(preflight.status, 200)

let sample = readFileSync(resolve(import.meta.dir, '../../src/server/sample.conf'), 'utf8')
ttrue(sample.includes('Default is to allow GET, HEAD, POST. CrossOrigin adds OPTIONS.'))
