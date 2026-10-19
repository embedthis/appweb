/*
    environment.tst.ts - A CGI program does not inherit the server's environment
 */

import {ttrue} from '@embedthis/testme'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, spawnServer, waitForServer} from '../security/server'
import {exchange} from '../security/wire'

const PORT = 4593
const WORK = resolve(TESTDIR, 'tmp/cgi-environment')

rmSync(WORK, {recursive: true, force: true})
mkdirSync(WORK, {recursive: true})
writeFileSync(resolve(WORK, 'appweb.conf'), [
    `ErrorLog ${WORK}/error.log level=2`,
    `Listen 127.0.0.1:${PORT}`,
    `Documents ${TESTDIR}/web`,
    `AddHandler cgiHandler cgi`,
    ``,
].join('\n'))

let server = spawnServer(['--config', resolve(WORK, 'appweb.conf')], {
    stderr: 'ignore', env: {...process.env, APPWEB_TEST_SECRET: 'leakme'},
})
try {
    ttrue(await waitForServer(PORT))
    let reply = await exchange(PORT, 'GET /cgiProgram.cgi?switches=-e HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    if (reply.text.includes('leakme') || !reply.text.includes('PATH=')) {
        console.log(reply.text)
    }
    ttrue(!reply.text.includes('APPWEB_TEST_SECRET'))
    ttrue(!reply.text.includes('leakme'))
    ttrue(reply.text.includes('PATH='))
    ttrue(reply.text.includes('SERVER_SOFTWARE='))
} finally {
    server.kill('SIGKILL')
    await server.exited
    rmSync(WORK, {recursive: true, force: true})
}
