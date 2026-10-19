/* HSTS max-age must equal the configured age with or without includeSubDomains. */

import {ttrue} from '@embedthis/testme'
import {resolve} from 'node:path'
import {TESTDIR, withServer} from '../security/server'

const PORT = 6215
const SECURE = 6216
const CERTS = resolve(TESTDIR, '../certs')

async function hsts(path: string): Promise<string | null> {
    let response = await fetch(`https://127.0.0.1:${SECURE}${path}`, {
        signal: AbortSignal.timeout(5000),
        tls: {rejectUnauthorized: false},
    } as any)
    await response.text()
    return response.headers.get('strict-transport-security')
}

await withServer('hsts-domains', PORT, [
    `ListenSecure 127.0.0.1:${SECURE}`,
    `SSLCertificateFile ${CERTS}/test.crt`,
    `SSLCertificateKeyFile ${CERTS}/test.key`,
    `<Route ^/auth/basic/>`,
    `    Require secure age=30days domains`,
    `</Route>`,
    `<Route ^/auth/cached/>`,
    `    Require secure age=30days`,
    `</Route>`,
], async () => {
    ttrue(await hsts('/auth/basic/basic.html') == 'max-age=2592000; includeSubDomains',
        'age=30days domains must be max-age=2592000 with includeSubDomains')
    ttrue(await hsts('/auth/cached/index.html') == 'max-age=2592000', 'age=30days must be max-age=2592000')
})
