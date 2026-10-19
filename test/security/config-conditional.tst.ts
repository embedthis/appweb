/*
    config-conditional.tst.ts - <if>, <else> and </if> in the configuration file
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer, workDir} from './server'

const PORT = 4529

async function get(path: string): Promise<{status: number, body: string}> {
    let response = await fetch(`http://127.0.0.1:${PORT}${path}`)
    return {status: response.status, body: await response.text()}
}

async function expect(path: string, status: number, marker: string | null): Promise<void> {
    let r = await get(path)
    if (r.status != status || (marker != null && !r.body.includes(marker))) {
        console.log(path + ' expected ' + status + ' ' + (marker || '') + ' but got ' + r.status + ' ' + r.body)
    }
    teq(r.status, status)
    if (marker != null) {
        ttrue(r.body.includes(marker))
    }
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('config-conditional', PORT, [
        '<if vms>',
        '    <Route ^/wrong-if>',
        '        Target write 200 "wrong-if"',
        '    </Route>',
        '    <if !vms>',
        '        <Route ^/wrong-nested>',
        '            Target write 200 "wrong-nested"',
        '        </Route>',
        '    <else>',
        '        <Route ^/wrong-nested-else>',
        '            Target write 200 "wrong-nested-else"',
        '        </Route>',
        '    </if>',
        '    <Route ^/wrong-after-nested>',
        '        Target write 200 "wrong-after-nested"',
        '    </Route>',
        '<else>',
        '    <Route ^/else-branch>',
        '        Target write 200 "else-branch"',
        '    </Route>',
        '    <if !vms>',
        '        <Route ^/else-nested>',
        '            Target write 200 "else-nested"',
        '        </Route>',
        '    </if>',
        '</if>',
        '<if !vms>',
        '    <Route ^/if-branch>',
        '        Target write 200 "if-branch"',
        '    </Route>',
        '<else>',
        '    <Route ^/wrong-else>',
        '        Target write 200 "wrong-else"',
        '    </Route>',
        '</if>',
        '<Route ^/after>',
        '    Target write 200 "after"',
        '</Route>',
    ], async () => {
        await expect('/else-branch', 200, 'else-branch')
        await expect('/else-nested', 200, 'else-nested')
        await expect('/if-branch', 200, 'if-branch')
        await expect('/after', 200, 'after')
        for (let path of ['/wrong-if', '/wrong-nested', '/wrong-nested-else', '/wrong-after-nested', '/wrong-else']) {
            await expect(path, 404, null)
        }
    })

    /*
        Reject unmatched conditional directives and unknown condition names at startup.
     */
    for (let [name, lines, message] of [
        ['unbalanced', ['<if vms>', '    Documents ' + TESTDIR + '/web', '</if>', '</if>'], 'Too many closing blocks'],
        ['bare-else', ['<else>', 'Documents ' + TESTDIR + '/web'], '<else> without <if>'],
        ['unknown', ['<if TLS_MODULE>', '    Documents ' + TESTDIR + '/web', '</if>'],
            'Unknown condition "TLS_MODULE"'],
        ['unknown-negated', ['<if !WEBSOCKETS>', '    Documents ' + TESTDIR + '/web', '</if>'],
            'Unknown condition "WEBSOCKETS"'],
    ] as [string, string[], string][]) {
        let work = workDir('config-' + name)
        rmSync(work, {recursive: true, force: true})
        mkdirSync(work, {recursive: true})
        let conf = resolve(work, 'appweb.conf')
        writeFileSync(conf, [`ErrorLog ${work}/error.log level=4`, `Listen 127.0.0.1:${PORT}`, ...lines, ''].join('\n'))
        let server = Bun.spawn([BIN, '--config', conf], {stdout: 'pipe', stderr: 'pipe'})
        let exited = await Promise.race([server.exited, Bun.sleep(5000).then(() => 'timeout')])
        if (exited == 'timeout') {
            server.kill('SIGKILL')
            console.log(name + ': server started with a malformed configuration')
        }
        ttrue(exited != 'timeout')
        teq(server.signalCode, null)
        ttrue(typeof exited == 'number' && exited != 0)
        let output = await new Response(server.stderr).text()
        let log = resolve(work, 'error.log')
        if (existsSync(log)) {
            output += readFileSync(log, 'utf8')
        }
        if (!output.includes(message)) {
            console.log(name + ': expected "' + message + '" but got:\n' + output)
        }
        ttrue(output.includes(message))
        rmSync(work, {recursive: true, force: true})
    }
}
