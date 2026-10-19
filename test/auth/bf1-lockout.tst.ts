/* BF1 accounts whose user and realm fill the key window must be reported as locked out. */

import {tfalse, tskip, ttrue} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from '../security/server'

const PORT = 4603
const NAME = 'bf1-lockout'
const REALM = 'Acme Corporation Embedded Device Administration'

async function status(user: string, password: string): Promise<number> {
    let encoded = Buffer.from(`${user}:${password}`).toString('base64')
    let response = await fetch(`http://127.0.0.1:${PORT}/long/index.html`, {
        headers: {Authorization: `Basic ${encoded}`},
    })
    return response.status
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer(NAME, PORT, [
        'User administrator BF1:00128:bWFG5x85BYfuf7GW:vmG6SiW7l0JvjbnpnUFFyxQB8vGq3ZgH user',
        '<Route ^/long/>',
        `    AuthType basic "${REALM}"`,
        '    Require valid-user',
        '</Route>',
    ], async () => {
        let log = readFileSync(resolve(workDir(NAME), 'error.log'), 'utf8')

        ttrue(log.includes(`User "administrator" in realm "${REALM}" has a BF1 password that cannot authenticate`))
        tfalse(log.includes('any password authenticates'))

        ttrue(await status('administrator', 'wrong') == 401)
        ttrue(await status('administrator', '') == 401)
    })
}
