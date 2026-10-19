/*
    header-vars.tst.ts - A backend's response header is not expanded for ${...} request variables
 */

import {teq, ttrue, tget, tskip} from '@embedthis/testme'
import {chmodSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SCRIPT = resolve(import.meta.dir, '../cgi-bin/header-vars')
const TEMPLATE = '${header:X-Secret}|${request:clientAddress}'

if (process.platform == 'win32') {
    tskip('Skip test -- the CGI script is a shell script')
} else {
    writeFileSync(SCRIPT, `#!/bin/sh\nprintf 'Content-Type: text/plain\\r\\nX-Reflected: ${TEMPLATE}\\r\\n\\r\\nok'\n`)
    chmodSync(SCRIPT, 0o755)
    try {
        let response = await fetch(HTTP + '/cgi-bin/header-vars', {headers: {'X-Secret': 'top-secret-value'}})
        teq(response.status, 200)
        let reflected = response.headers.get('x-reflected') || ''
        if (reflected != TEMPLATE) {
            console.log('backend header was expanded: ' + reflected)
        }
        ttrue(!reflected.includes('top-secret-value'))
        teq(reflected, TEMPLATE)
    } finally {
        rmSync(SCRIPT, {force: true})
    }
}
