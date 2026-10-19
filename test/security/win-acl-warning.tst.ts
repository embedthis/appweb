/*
    win-acl-warning.tst.ts - Startup warns when a non-administrator can change what the server runs
 */

import {tskip, ttrue} from '@embedthis/testme'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

if (process.platform != 'win32') {
    tskip('the startup ACL check is Windows only')
    process.exit(0)
}

const BIN = resolve(import.meta.dir, '../../build/bin')
const PORT = 4510
const USERS = '*S-1-5-32-545'

function icacls(...args: string[]) {
    let proc = Bun.spawnSync(['icacls', ...args], {stdout: 'pipe', stderr: 'pipe'})
    ttrue(proc.exitCode == 0, `icacls ${args.join(' ')}: ${proc.stdout.toString()}${proc.stderr.toString()}`)
}


async function startupLog(dir: string, conf: string): Promise<string> {
    let proc = Bun.spawn([join(BIN, 'appweb.exe'), '--log', 'stdout:0', '--home', dir, '--config', conf],
        {stdout: 'pipe', stderr: 'pipe'})
    let output = ''
    let reader = proc.stdout.getReader()
    let deadline = Date.now() + 10000
    while (!output.includes('Started HTTP service') && Date.now() < deadline) {
        let chunk = await Promise.race([reader.read(), Bun.sleep(500).then(() => null)])
        if (chunk && !chunk.done) {
            output += new TextDecoder().decode(chunk.value)
        } else if (chunk && chunk.done) {
            break
        }
    }
    proc.kill()
    await proc.exited
    ttrue(output.includes('Started HTTP service'), `the server did not start: ${output}`)
    return output
}

//  MPR may log either separator, so compare paths in one form
function warns(output: string, path: string): boolean {
    let normal = (text: string) => text.replace(/\\/g, '/').toLowerCase()
    let lines = output.split(/\r?\n/).filter(line => line.includes('Security risk'))
    return lines.some(line => normal(line).includes(`${normal(path)} is writable by non-administrators`))
}

let top = mkdtempSync(join(tmpdir(), 'acl-'))
let dir = join(top, 'server')
mkdirSync(join(dir, 'web'), {recursive: true})
let conf = join(dir, 'appweb.conf')
writeFileSync(conf, `Listen 127.0.0.1:${PORT}\nDocuments web\nAddHandler fileHandler\n`)

try {
    //  Only administrators, SYSTEM and this account may change the scratch tree
    let me = process.env.USERNAME || ''
    icacls(dir, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', `${me}:(OI)(CI)F`)
    icacls(conf, '/inheritance:r', '/grant:r', '*S-1-5-32-544:F', '*S-1-5-18:F', `${me}:F`)

    //  Positive: nothing the test controls is named
    let output = await startupLog(dir, conf)
    ttrue(!warns(output, conf), `a protected configuration was named: ${output}`)
    ttrue(!warns(output, dir), `a protected home was named: ${output}`)

    //  BUILTIN\Users may modify the configuration
    icacls(conf, '/grant', `${USERS}:(M)`)
    output = await startupLog(dir, conf)
    ttrue(warns(output, conf), `a Users-writable configuration was not named: ${output}`)
    icacls(conf, '/remove:g', USERS)

    //  BUILTIN\Users may only delete children of the home directory
    icacls(dir, '/grant', `${USERS}:(DC)`)
    output = await startupLog(dir, conf)
    ttrue(warns(output, dir), `a home that Users can delete files from was not named: ${output}`)
    icacls(dir, '/remove:g', USERS)
} finally {
    rmSync(top, {recursive: true, force: true})
}
