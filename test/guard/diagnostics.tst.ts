/*
    diagnostics.tst.ts - The warning set catches a non-literal format string with arguments and an if/else whose branches are identical
 */

import {ttrue} from '@embedthis/testme'
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

const DIR = resolve(import.meta.dir, '../../projects/gmake2')

function check(ok: boolean, what: string): void {
    if (!ok) {
        console.log(what)
    }
    ttrue(ok)
}

function sections(file: string): Map<string, string> {
    let text = readFileSync(resolve(DIR, file), 'utf8')
    let result = new Map<string, string>()
    for (let section of text.split(/\n(?:else )?ifeq \(\$\(config\),/).slice(1)) {
        let config = section.slice(0, section.indexOf(')'))
        result.set(config, (/ALL_CFLAGS \+=(.*)/.exec(section) || ['', ''])[1])
    }
    return result
}

for (let file of readdirSync(DIR).filter(f => f.endsWith('.make'))) {
    for (let [config, cflags] of sections(file)) {
        check(cflags.includes('-Wformat-nonliteral'), `${file} ${config}: no -Wformat-nonliteral`)
        if (/_(linux|freebsd)$/.test(config)) {
            check(cflags.includes('-Wduplicated-branches'), `${file} ${config}: no -Wduplicated-branches`)
        }
    }
}

let platform = process.platform == 'darwin' ? 'macosx' : process.platform == 'linux' ? 'linux' : ''
if (platform) {
    let cflags = sections('appweb-lib.make').get(`release_${platform}`) || ''
    let flags = cflags.replace('$(CFLAGS)', '').replace('$(ALL_CPPFLAGS)', '').trim().split(/\s+/)
    let dir = mkdtempSync(join(tmpdir(), 'diagnostics-'))

    function compiles(name: string, source: string): boolean {
        let path = join(dir, name + '.c')
        writeFileSync(path, source)
        let proc = Bun.spawnSync(['cc', '-Werror', ...flags, '-c', path, '-o', join(dir, name + '.o')], {stderr: 'pipe'})
        return proc.exitCode == 0
    }
    check(compiles('clean', '#include <stdio.h>\nvoid f(const char *s, int n) { printf("%s %d", s, n); }\n'),
        'clean code must compile with the release flags')
    check(!compiles('nonliteral', '#include <stdio.h>\nvoid f(const char *s, int n) { printf(s, n); }\n'),
        'a non-literal format string with arguments must fail a -Werror build')
    if (platform == 'linux') {
        check(!compiles('branches', 'int f(int a) { int n = 0; if (a) { n++; } else { n++; } return n; }\n'),
            'an if/else with identical branches must fail a -Werror build')
    }
    rmSync(dir, {recursive: true, force: true})
}
