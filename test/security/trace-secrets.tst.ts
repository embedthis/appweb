/*
    trace-secrets.tst.ts - The trace log does not record session ids or credentials
 */

import {ttrue, tskip} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from './server'

const PORT = 4548
const NAME = 'trace-secrets'
const SECRET = 'Basic ' + btoa('ralph:trace-secret-password')

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer(NAME, PORT, [
        'Trace context=1 headers=1',
        '<Route ^/action/>',
        '    SetHandler actionHandler',
        '</Route>',
    ], async () => {
        let response = await fetch(`http://127.0.0.1:${PORT}/action/sessionTest`, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded', Authorization: SECRET},
            body: 'number=41',
        })
        ttrue(response.status == 200)
        let cookie = response.headers.get('set-cookie') || ''
        let id = cookie.split(';')[0].split('=').slice(1).join('=')
        ttrue(id.length > 0)

        let log = readFileSync(resolve(workDir(NAME), 'trace.log'), 'utf8')
        ttrue(log.includes('session.create'))
        ttrue(/authorization: \[redacted\]/i.test(log))
        if (log.includes(id) || log.includes(SECRET)) {
            console.log('trace log holds a secret:\n' + log)
        }
        ttrue(!log.includes(id))
        ttrue(!log.includes(SECRET))
    })
}
