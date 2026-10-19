/*
    gateway-trace-secrets.tst.ts - CGI and FastCGI detail traces do not record credentials
 */

import {ttrue, tskip} from '@embedthis/testme'
import {chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer, workDir} from './server'

const PORT = 4586
const NAME = 'gateway-trace-secrets'
const SCRIPTS = resolve(TESTDIR, 'tmp/gateway-trace-scripts')
const COOKIE = 'sid=gateway-cookie-secret'
const AUTH = 'Basic ' + btoa('ralph:gateway-trace-password')

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform == 'win32') {
    tskip('Skip test -- the CGI fixture is a POSIX shell script and fastProgram is POSIX-only')
} else {
    mkdirSync(SCRIPTS, {recursive: true})
    let script = resolve(SCRIPTS, 'set-cookie')
    writeFileSync(script, `#!/bin/sh\nprintf 'Content-Type: text/plain\\r\\nSet-Cookie: ${COOKIE}\\r\\n\\r\\nok'\n`)
    chmodSync(script, 0o755)

    try {
        await withServer(NAME, PORT, [
            'Trace detail=1',
            `ScriptAlias /cgi/ "${SCRIPTS}/" cgiHandler`,
            '<Route ^/fast-bin/(.*)$>',
            '    AddHandler fastHandler',
            '    Prefix /fast-bin',
            `    Documents ${TESTDIR}/fast-bin`,
            '    FastConnect 127.0.0.1:0 launch min=1 max=1 wait=60secs',
            '    Target run $1',
            '</Route>',
        ], async () => {
            let cgi = await fetch(`http://127.0.0.1:${PORT}/cgi/set-cookie`)
            ttrue(cgi.status == 200)
            ttrue((cgi.headers.get('set-cookie') || '').includes(COOKIE))

            let fast = await fetch(`http://127.0.0.1:${PORT}/fast-bin/fastProgram`, {
                headers: {Authorization: AUTH, Cookie: COOKIE},
            })
            ttrue(fast.status == 200)
            await fast.text()

            let log = readFileSync(resolve(workDir(NAME), 'trace.log'), 'utf8')
            ttrue(/CGI response header, key:Set-Cookie, value:\[redacted\]/i.test(log))
            ttrue(/FastCGI env, key:HTTP_Cookie, value:\[redacted\]/i.test(log))
            if (log.includes('gateway-cookie-secret') || log.includes(AUTH)) {
                console.log('trace log holds a secret:\n' + log)
            }
            ttrue(!log.includes('gateway-cookie-secret'))
            ttrue(!log.includes(AUTH))
        })
    } finally {
        rmSync(SCRIPTS, {recursive: true, force: true})
    }
}
