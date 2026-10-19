/* Reset pipeline must remove inherited handler mappings before new handlers are added. */

import {tfalse, tskip, ttrue} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer, workDir} from '../security/server'

const PORT = 4604
const NAME = 'reset-pipeline'

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer(NAME, PORT, [
        'AddHandler cgiHandler cgi',
        '<Route ^/reset/>',
        '    Prefix /reset',
        `    Documents ${TESTDIR}/web`,
        '    Reset pipeline',
        '    AddHandler fileHandler ""',
        '    Cache server=1hour',
        '</Route>',
        '<Route ^/inherit/>',
        '    Prefix /inherit',
        `    Documents ${TESTDIR}/web`,
        '</Route>',
    ], async () => {
        let log = readFileSync(resolve(workDir(NAME), 'error.log'), 'utf8')
        tfalse(log.includes('Route ^/reset/ caches cgiHandler'))

        let reset = await fetch(`http://127.0.0.1:${PORT}/reset/cgiProgram.cgi`)
        let body = await reset.text()
        ttrue(reset.status == 200)
        tfalse(body.startsWith('<HTML>'))

        let inherit = await fetch(`http://127.0.0.1:${PORT}/inherit/cgiProgram.cgi`)
        ttrue(inherit.status == 200)
        ttrue((await inherit.text()).startsWith('<HTML><TITLE>cgiProgram: Output'))
    })
}
