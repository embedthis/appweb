/*
    update-cmd-args.tst.ts - A request value expanded into an "Update cmd" command is exactly one argument
 */

import {teq, ttrue, tskip} from '@embedthis/testme'
import {chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, withServer, workDir} from './server'

const PORT = 4578
const NAME = 'update-cmd-args'

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform == 'win32') {
    tskip('Skip test -- the command is a shell script')
} else {
    let work = workDir(NAME)
    let script = resolve(work, 'record.sh')
    let out = resolve(work, 'args.txt')
    await withServer(NAME, PORT, [
        '<Route ^/update/>',
        `    Update cmd ${script} fixed \${header:X-Arg}`,
        '    Target write 200 "done"',
        '</Route>',
        '<Route ^/submatch/(.*)$>',
        `    Update cmd ${script} fixed $1`,
        '    Target write 200 "done"',
        '</Route>',
    ], async () => {
        mkdirSync(work, {recursive: true})
        writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$#" "$@" > ${out}\n`)
        chmodSync(script, 0o755)

        let value = `one two --three 'four five'`
        let response = await fetch(`http://127.0.0.1:${PORT}/update/x`, {headers: {'X-Arg': value}})
        teq(response.status, 200)
        await response.text()
        let lines = readFileSync(out, 'utf8').split('\n')
        if (lines[0] != '2') {
            console.log('command received: ' + JSON.stringify(lines))
        }
        teq(lines[0], '2')
        teq(lines[1], 'fixed')
        teq(lines[2], value)

        response = await fetch(`http://127.0.0.1:${PORT}/submatch/a%20b%20--c`)
        teq(response.status, 200)
        await response.text()
        lines = readFileSync(out, 'utf8').split('\n')
        if (lines[0] != '2') {
            console.log('command received: ' + JSON.stringify(lines))
        }
        teq(lines[0], '2')
        teq(lines[2], 'a b --c')
    })
}
