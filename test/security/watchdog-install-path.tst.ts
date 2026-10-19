/*
    Verify the watchdog registers a service only with its complete, quoted program path.

    A program path that cannot be read in full must fail the install and register nothing, rather than register a
    truncated path that names a different or nonexistent program. Needs an elevated Windows runner.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

if (process.platform != 'win32') {
    tskip('the watchdog service install is Windows only')
    process.exit(0)
}

const BIN = resolve(import.meta.dir, '../../build/bin')
const MAX_FNAME = 280

function run(args: string[]): {status: number, output: string} {
    let proc = Bun.spawnSync(args, {stdout: 'pipe', stderr: 'pipe'})
    return {status: proc.exitCode ?? -1, output: proc.stdout.toString() + proc.stderr.toString()}
}

function serviceExists(name: string): boolean {
    return run(['sc', 'query', name]).status == 0
}

function stage(dir: string): string {
    mkdirSync(dir, {recursive: true})
    copyFileSync(join(BIN, 'watchdog.exe'), join(dir, 'watchdog.exe'))
    copyFileSync(join(BIN, 'libappweb.dll'), join(dir, 'libappweb.dll'))
    return join(dir, 'watchdog.exe')
}

if (!existsSync(join(BIN, 'watchdog.exe'))) {
    tskip(`no watchdog.exe in ${BIN}`)
    process.exit(0)
}
if (run(['net', 'session']).status != 0) {
    tskip('SKIP: installing a service needs an elevated runner')
    process.exit(0)
}

let top = mkdtempSync(join(tmpdir(), 'wdog-'))
let name = `appwebtest${process.pid}`

try {
    //  Positive: a normal path installs with the full program path quoted
    let program = stage(join(top, 'short dir'))
    let result = run([program, '--name', name, 'install'])
    ttrue(result.status == 0, `install from a normal path failed: ${result.output}`)
    let config = run(['sc', 'qc', name]).output
    ttrue(config.includes(`"${program}"`), `service path is not the quoted program path: ${config}`)
    run([program, '--name', name, 'uninstall'])
    ttrue(!serviceExists(name), 'uninstall left the service registered')

    //  A program path longer than the watchdog can hold must not register a service
    let deep = top
    while (deep.length <= MAX_FNAME + 20) {
        deep = join(deep, 'a-directory-name-that-pads-the-path')
    }
    let longProgram: string
    try {
        longProgram = stage(deep)
    } catch (err) {
        tskip(`SKIP: cannot create a path over ${MAX_FNAME} characters (LongPathsEnabled is off): ${err}`)
        process.exit(0)
    }
    let probe = run([longProgram, '--help'])
    if (probe.status == -1) {
        tskip(`SKIP: the runner cannot launch a program from a path over ${MAX_FNAME} characters`)
        process.exit(0)
    }
    result = run([longProgram, '--name', name, 'install'])
    let registered = serviceExists(name)
    if (registered) {
        console.log(run(['sc', 'qc', name]).output)
    }
    ttrue(result.status != 0, 'install from an over-long path reported success')
    ttrue(!registered, 'install from an over-long path registered a service with a truncated path')
} finally {
    if (serviceExists(name)) {
        run(['sc', 'delete', name])
    }
    rmSync(top, {recursive: true, force: true})
}
