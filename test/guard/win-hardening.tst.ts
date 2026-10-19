/* Verify Windows binaries have ASLR, DEP, high-entropy ASLR, CET compatibility and a Guard CF function table. */

import {tskip, ttrue} from '@embedthis/testme'
import {existsSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'

if (process.platform != 'win32') {
    tskip('the Windows binary hardening properties are checked only on Windows')
    process.exit(0)
}

const BIN = resolve(import.meta.dir, '../../build/bin')

function dumpbin(option: string, path: string): string {
    let proc = Bun.spawnSync(['dumpbin', option, path], {stdout: 'pipe', stderr: 'pipe'})
    return proc.stdout.toString()
}

function check(ok: boolean, what: string): void {
    if (!ok) {
        console.log(what)
    }
    ttrue(ok)
}

let binaries = readdirSync(BIN).filter(f => /^(appweb|authpass|http|watchdog)\.exe$|^libappweb\.dll$/.test(f))
check(binaries.length > 0 && existsSync(resolve(BIN, 'libappweb.dll')), `no binaries found in ${BIN}`)

for (let name of binaries) {
    let path = resolve(BIN, name)
    let headers = dumpbin('/headers', path)
    check(headers.includes('Dynamic base'), `${name}: not built with /DYNAMICBASE`)
    check(headers.includes('NX compatible'), `${name}: not built with /NXCOMPAT`)
    check(headers.includes('High Entropy Virtual Addresses'), `${name}: not built with /HIGHENTROPYVA`)
    check(headers.includes('Guard'), `${name}: not built with /guard:cf`)
    check(/CET compatible/i.test(headers), `${name}: not built with /CETCOMPAT`)
    let loadconfig = dumpbin('/loadconfig', path)
    check(/Guard CF Function Table/i.test(loadconfig), `${name}: no Guard CF function table`)
}
