/*
    TLS keys must load before the privilege drop. Remove the key after startup to verify handshakes use the
    preloaded key; unreadable keys must fail startup.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, spawnServer, withServer} from '../security/server'
import {cert, get} from './tls'

const PORT = 4605
const SECURE = 4606
const KEYS = resolve(TESTDIR, 'tmp/key-preload-keys')

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(KEYS, {recursive: true, force: true})
    mkdirSync(KEYS, {recursive: true})
    copyFileSync(cert('test.crt'), resolve(KEYS, 'test.crt'))
    copyFileSync(cert('test.key'), resolve(KEYS, 'test.key'))

    await withServer('key-preload', PORT, [
        `ListenSecure 127.0.0.1:${SECURE}`,
        `SSLCertificateFile "${KEYS}/test.crt"`,
        `SSLCertificateKeyFile "${KEYS}/test.key"`,
    ], async () => {
        rmSync(resolve(KEYS, 'test.key'))
        ttrue(await get(`https://127.0.0.1:${SECURE}/index.html`, {insecure: true}) == '200')
    })

    /*
        Use an existing invalid key to test startup loading beyond the parser's missing-file check.
     */
    writeFileSync(resolve(KEYS, 'invalid.key'), 'not a private key\n')
    let work = resolve(TESTDIR, 'tmp/key-preload-invalid')
    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    let conf = resolve(work, 'appweb.conf')
    writeFileSync(conf, [
        `ErrorLog ${work}/error.log level=2`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `ListenSecure 127.0.0.1:${SECURE}`,
        `SSLCertificateFile "${KEYS}/test.crt"`,
        `SSLCertificateKeyFile "${KEYS}/invalid.key"`,
        ``,
    ].join('\n'))
    let server = spawnServer(['--config', conf], {stderr: 'ignore'})
    let exited = await Promise.race([server.exited.then(() => true), Bun.sleep(5000).then(() => false)])
    if (!exited) {
        server.kill('SIGKILL')
    }
    ttrue(exited && server.exitCode != 0)
    let log = existsSync(`${work}/error.log`) ? readFileSync(`${work}/error.log`, 'utf8') : ''
    ttrue(log.includes('Cannot load the TLS configuration') && log.includes('invalid.key'))

    rmSync(work, {recursive: true, force: true})
    rmSync(KEYS, {recursive: true, force: true})
}
