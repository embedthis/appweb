/*
    unsafe-home.tst.ts - The server refuses to start from a home directory others can write
 */

import {tskip, ttrue} from '@embedthis/testme'
import {chmodSync, existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR} from './server'

const PORT = 4584
const HOME = resolve(TESTDIR, 'tmp/unsafe-home')

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform == 'win32') {
    tskip('Skip test -- the check is for Unix permissions')
} else {
    rmSync(HOME, {recursive: true, force: true})
    mkdirSync(HOME, {recursive: true})
    try {
        writeFileSync(resolve(HOME, 'appweb.conf'), `Listen 127.0.0.1:${PORT}\nDocuments ${TESTDIR}/web\n`)
        chmodSync(HOME, 0o777)

        let server = Bun.spawn([BIN, '--home', HOME, '--config', 'appweb.conf'], {stdout: 'pipe', stderr: 'pipe'})
        let status = await Promise.race([server.exited, Bun.sleep(10000).then(() => 'running')])
        if (status == 'running') {
            server.kill('SIGKILL')
            await server.exited
        }
        let output = await new Response(server.stderr).text() + await new Response(server.stdout).text()
        if (status == 'running') {
            console.log('server started from a world writable home: ' + output)
        }
        ttrue(status != 'running' && status != 0)
        ttrue(output.includes('writeable by others'))
    } finally {
        chmodSync(HOME, 0o755)
        rmSync(HOME, {recursive: true, force: true})
    }
}
