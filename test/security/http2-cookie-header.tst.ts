/*
    http2-cookie-header.tst.ts - Degenerate Cookie headers over HTTP/2
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, TESTDIR, withServer} from './server'
import {literal, literalIndexedName, requestBlock, sendH2} from './h2'

const PORT = 4523
const PATH = '/auth/basic/joshua/user.html'

function request(cookie: string, authenticated: boolean): Buffer {
    let extra = [literalIndexedName(32, cookie)]               // cookie, static index 32
    if (authenticated) {
        extra.push(literalIndexedName(23, 'Basic ' + btoa('joshua:pass1')))   // authorization, static index 23
    }
    return requestBlock(PATH, `127.0.0.1:${PORT}`, extra)
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('http2-cookie-header', PORT, [
        `User joshua 2fd6e47ff9bb70c0465fd2f5c8e5305e user`,
        `<Route ^/auth/basic/>`,
        `    Documents ${TESTDIR}/web`,
        `    AuthType basic example.com`,
        `    Require user joshua`,
        `</Route>`,
    ], async () => {
        //  A value that is only whitespace is malformed over HTTP/2 (RFC 9113 8.2.1) and refused
        let blank = await sendH2(PORT, request(' ', false))
        teq(blank.goaway, 1)

        for (let cookie of [';', ';;;', '; ; ;', ';=;']) {
            let denied = await sendH2(PORT, request(cookie, false))
            if (denied.goaway || denied.reset || denied.headers != 1) {
                console.log('Cookie "' + cookie + '" unauthenticated got ' + JSON.stringify(denied))
            }
            teq(denied.goaway, 0)
            teq(denied.reset, 0)
            teq(denied.headers, 1)

            let allowed = await sendH2(PORT, request(cookie, true))
            if (!allowed.data.includes('Welcome to Basic')) {
                console.log('Cookie "' + cookie + '" authenticated got ' + JSON.stringify(allowed))
            }
            ttrue(allowed.data.includes('Welcome to Basic'))
        }
    })
}
