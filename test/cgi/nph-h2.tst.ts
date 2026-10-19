/*
    nph-h2.tst.ts - A non-parsed-header CGI program's status and headers are honoured over HTTP/2
 */

import {ttrue, tskip} from '@embedthis/testme'
import {chmodSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {TESTDIR, withServer} from '../security/server'
import {exchange} from '../security/wire'

const PORT = 4582
const SCRIPTS = resolve(TESTDIR, 'tmp/nph-h2-scripts')

if (process.platform == 'win32') {
    tskip('Skip test -- the nph program is a POSIX shell script')
} else if (!Bun.which('curl')) {
    tskip('Skip test -- needs curl for an HTTP/2 prior-knowledge request')
} else {
    mkdirSync(SCRIPTS, {recursive: true})
    let script = resolve(SCRIPTS, 'nph-moved')
    writeFileSync(script, "#!/bin/sh\nprintf 'HTTP/1.0 302 Found\\r\\nLocation: /elsewhere\\r\\n" +
        "Content-Type: text/plain\\r\\n\\r\\nmoved'\n")
    chmodSync(script, 0o755)

    try {
        await withServer('nph-h2', PORT, [`ScriptAlias /nph/ "${SCRIPTS}/" cgiHandler`], async () => {
            let h2 = Bun.spawnSync(['curl', '-s', '--http2-prior-knowledge', '-o', '-',
                '-w', '\n%{http_version} %{http_code}', `http://127.0.0.1:${PORT}/nph/nph-moved`]).stdout.toString()
            if (!h2.endsWith('\n2 302')) {
                console.log('HTTP/2 response: ' + JSON.stringify(h2))
            }
            ttrue(h2.endsWith('\n2 302'))
            ttrue(!h2.includes('HTTP/1.0'))

            let h1 = await exchange(PORT, `GET /nph/nph-moved HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
            ttrue(h1.text.startsWith('HTTP/1.0 302 Found'))
        })
    } finally {
        rmSync(SCRIPTS, {recursive: true, force: true})
    }
}
