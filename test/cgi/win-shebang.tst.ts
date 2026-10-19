/*
    Windows resolves relative shebang interpreters from the script directory, never PATH, and accepts a final line
    without a newline.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from '../security/server'

const PORT = 4590
const NAME = 'win-shebang'

if (process.platform != 'win32') {
    tskip('Skip test -- the MPR parses #! itself only on Windows')
} else {
    let docs = workDir(NAME + '-docs')
    rmSync(docs, {recursive: true, force: true})
    mkdirSync(docs, {recursive: true})
    copyFileSync(resolve(BIN, '..', 'cgiProgram.exe'), resolve(docs, 'interp.exe'))
    writeFileSync(resolve(docs, 'local.cgi'), '#!interp.exe')
    writeFileSync(resolve(docs, 'path.cgi'), '#!cmd.exe\r\n')

    await withServer(NAME, PORT, [
        `Documents ${docs}`,
        'AddHandler cgiHandler cgi',
    ], async () => {
        let local = await fetch(`http://127.0.0.1:${PORT}/local.cgi`)
        teq(local.status, 200)

        let path = await fetch(`http://127.0.0.1:${PORT}/path.cgi`, {signal: AbortSignal.timeout(10000)})
        ttrue(path.status != 200)
    })
    rmSync(docs, {recursive: true, force: true})
}
