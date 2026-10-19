/*
    insecure-cipher.tst.ts - SSLCipherSuite selecting insecure suites fails the configuration
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, spawnServer, withServer, workDir} from './server'

const PORT = 4580
const SECURE = 4581
const CERTS = resolve(TESTDIR, '../certs')

function secure(ciphers: string): string[] {
    return [
        `ListenSecure 127.0.0.1:${SECURE}`,
        `SSLCertificateFile ${CERTS}/test.crt`,
        `SSLCertificateKeyFile ${CERTS}/test.key`,
        `SSLCipherSuite ${ciphers}`,
    ]
}

async function refused(ciphers: string): Promise<void> {
    let work = workDir('insecure-cipher')
    let conf = resolve(work, 'appweb.conf')
    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    writeFileSync(conf, [
        `ErrorLog ${work}/error.log level=2`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        ...secure(ciphers),
        ``,
    ].join('\n'))
    let server = spawnServer(['--config', conf], {stderr: 'ignore'})
    let status = await Promise.race([server.exited, Bun.sleep(10000).then(() => 'running')])
    if (status == 'running') {
        server.kill('SIGKILL')
        await server.exited
    }
    ttrue(status != 'running' && status != 0)
    ttrue(readFileSync(resolve(work, 'error.log'), 'utf8').includes('Insecure cipher'))
    rmSync(work, {recursive: true, force: true})
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (!existsSync(`${CERTS}/test.crt`)) {
    tskip('Skip test -- the test certificate is not present')
} else {
    await refused('ALL:eNULL')
    await refused('HIGH:aNULL')
    await refused('TLS_RSA_WITH_NULL_SHA256')

    await withServer('insecure-cipher-removed', PORT, secure('HIGH:!aNULL:!eNULL:!EXPORT'), async () => {
        let response = await fetch(`http://127.0.0.1:${PORT}/index.html`)
        teq(response.status, 200)
    })
}
