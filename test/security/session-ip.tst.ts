/*
    session-ip.tst.ts - An authenticated session is refused from an address other than the one that created it
 */

import {teq, ttrue, tskip} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, withServer} from './server'

const PORT = 4572
const V4 = `http://127.0.0.1:${PORT}/secure/`
const V6 = `http://[::1]:${PORT}/secure/`
const CREDENTIALS = 'Basic ' + btoa('joshua:pass1')

async function get(url: string, headers: Record<string, string>): Promise<Response | null> {
    try {
        return await fetch(url, {headers, signal: AbortSignal.timeout(3000)})
    } catch {
        return null
    }
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('session-ip', PORT, [
        `Listen [::1]:${PORT}`,
        '<Route ^/secure/>',
        '    AuthType basic example.com',
        '    User joshua 2fd6e47ff9bb70c0465fd2f5c8e5305e user',
        '    Require valid-user',
        '    Target write 200 "secure"',
        '</Route>',
    ], async () => {
        let login = await get(V4, {Authorization: CREDENTIALS})
        teq(login?.status, 200)
        let cookie = (login?.headers.get('set-cookie') || '').split(';')[0]
        ttrue(cookie.startsWith('-http-session-='))

        teq((await get(V4, {Cookie: cookie}))?.status, 200)

        let replay = await get(V6, {Cookie: cookie})
        if (replay == null) {
            tskip('IPv6 loopback is not available')
        } else {
            teq(replay.status, 401)
        }
    })
}
