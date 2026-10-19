/*
    home-option.tst.ts - Paths that resolve against the server home use --home, not the directory appweb started in

    SSL certificate paths are resolved against the default route's home, which is created before --home changes
    directory.
 */

import {teq, ttrue} from '@embedthis/testme'
import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, removeDir, waitForPortFree, waitForServer, workDir} from './server'

const PORT = 4519
const SSL_PORT = 4528
const MARKER = 'HOME-OPTION-DOCUMENT'

let work = workDir('home-option')
rmSync(work, {recursive: true, force: true})
mkdirSync(resolve(work, 'web'), {recursive: true})
writeFileSync(resolve(work, 'web/index.html'), MARKER)
for (let file of ['test.crt', 'test.key']) {
    copyFileSync(resolve(TESTDIR, '../certs', file), resolve(work, file))
}
let conf = resolve(work, 'appweb.conf')
writeFileSync(conf, [
    `Listen 127.0.0.1:${PORT}`,
    `ListenSecure 127.0.0.1:${SSL_PORT}`,
    'SSLCertificateFile test.crt',
    'SSLCertificateKeyFile test.key',
    'Documents web',
    'AddHandler fileHandler',
    ''].join('\n'))

ttrue(await waitForPortFree(PORT))
ttrue(await waitForPortFree(SSL_PORT))
let server = Bun.spawn([BIN, '--home', work, '--config', conf], {cwd: import.meta.dir, stdout: 'ignore', stderr: 'pipe'})
try {
    let started = await waitForServer(PORT)
    if (!started) {
        server.kill('SIGKILL')
        console.log(await new Response(server.stderr).text())
    }
    ttrue(started, 'the server must start with certificates named relative to --home')
    if (started) {
        let response = await fetch(`https://127.0.0.1:${SSL_PORT}/index.html`, {tls: {rejectUnauthorized: false}})
        teq(response.status, 200)
        teq(await response.text(), MARKER)
    }
} finally {
    server.kill('SIGKILL')
    await removeDir(work, server.exited)
}
