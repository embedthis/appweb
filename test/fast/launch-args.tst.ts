/*
    launch-args.tst.ts - The request that launches a shared FastCGI app does not reach its command line
 */

import {ttrue, tget} from '@embedthis/testme'
import {mkdirSync, rmSync, writeFileSync} from 'fs'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const URL = HTTP.startsWith('http') ? HTTP : 'http://' + HTTP
const DOCS = import.meta.dir + '/../tmp/fast-launch-args'

//  A failing run can leave a socket where a file was, so start clean
rmSync(DOCS, {recursive: true, force: true})
mkdirSync(DOCS, {recursive: true})
for (let file of ['first.html', 'second.html']) {
    writeFileSync(DOCS + '/' + file, file)
}
for (let file of ['first.html', 'second.html']) {
    let response = await fetch(URL + '/fast-launch-args/' + file)
    let body = await response.text()
    if (response.status != 200 || body.includes('ARG[1]')) {
        console.log('Status', response.status, 'body:\n' + body)
    }
    ttrue(response.status == 200)
    ttrue(/ARG\[0\]=[^<]*fastProgram/.test(body))
    ttrue(!body.includes('ARG[1]'))
    ttrue(body.includes(file))
}
