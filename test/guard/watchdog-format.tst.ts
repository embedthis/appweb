/*
    Verify every watchdog log call supplies an argument for each conversion in its format.

    GCC and Clang never compile the watchdog's Windows code, and MSVC does not check mprLogProc formats. clang-cl
    compiles the Windows branch and honours the PRINTF_ATTRIBUTE on mprLogProc, so it is the only compiler that sees
    these calls.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

if (process.platform != 'win32') {
    tskip('the watchdog Windows code is compiled only on Windows')
    process.exit(0)
}

const ROOT = resolve(import.meta.dir, '../..')
const SOURCE = resolve(ROOT, 'src/watchdog/watchdog.c')
const PROJECT = resolve(ROOT, 'projects/vs2022/watchdog.vcxproj')

function findClangCl(): string | null {
    let where = Bun.spawnSync(['where', 'clang-cl'], {stdout: 'pipe', stderr: 'pipe'})
    let found = where.stdout.toString().split(/\r?\n/).find(line => line.trim())
    if (found) {
        return found.trim()
    }
    let fallback = 'C:/Program Files/LLVM/bin/clang-cl.exe'
    return existsSync(fallback) ? fallback : null
}

//  The release configuration's defines, so the guard compiles what the build compiles
function releaseDefines(): string[] {
    let text = readFileSync(PROJECT, 'utf8')
    let group = text.split('<ItemDefinitionGroup').slice(1).find(g => g.includes("'release windows|x64'")) || ''
    let match = group.match(/<PreprocessorDefinitions>([^<]*)<\/PreprocessorDefinitions>/)
    let defines = match ? match[1].split(';').filter(d => d && !d.startsWith('%(')) : []
    return defines.map(d => '/D' + d.replace(/&quot;/g, '"'))
}

function compile(clang: string, file: string, defines: string[]): {status: number, output: string} {
    let args = [clang, '/nologo', '/Zs', '-Werror=format-insufficient-args', ...defines,
        '/I' + resolve(ROOT, 'src'), '/I' + resolve(ROOT, 'src/osdep'), '/I' + resolve(ROOT, 'src/mpr'), file]
    let proc = Bun.spawnSync(args, {stdout: 'pipe', stderr: 'pipe'})
    return {status: proc.exitCode ?? -1, output: proc.stdout.toString() + proc.stderr.toString()}
}

let clang = findClangCl()
if (!clang) {
    tskip('SKIP: clang-cl is not installed on this runner, so the watchdog log formats are unchecked')
    process.exit(0)
}

let defines = releaseDefines()
ttrue(defines.length > 0, `no release defines found in ${PROJECT}`)

// Verify the warning flag catches a missing argument before testing valid formats.
let dir = mkdtempSync(join(tmpdir(), 'watchdog-format-'))
try {
    let probe = join(dir, 'probe.c')
    writeFileSync(probe, '#include "mpr.h"\nvoid probe(void) { mprLogProc("probe", 0, "%s"); }\n')
    let control = compile(clang, probe, defines)
    ttrue(control.status != 0, 'clang-cl accepted a log call with a missing argument: the check is not live')
} finally {
    rmSync(dir, {recursive: true, force: true})
}

let result = compile(clang, SOURCE, defines)
if (result.status != 0) {
    console.log(result.output)
}
ttrue(result.status == 0, 'src/watchdog/watchdog.c has a log call with fewer arguments than conversions')
