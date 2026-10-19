/* Verify generated build flags reject format-string errors and undeclared calls while accepting valid code. */

import {ttrue} from '@embedthis/testme'
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

const DIR = resolve(import.meta.dir, '../../projects/gmake2')
const GATES = ['-Werror=format-security', '-Werror=implicit-function-declaration']

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
        for (let gate of GATES) {
            check(cflags.includes(gate), `${file} ${config}: no ${gate}`)
        }
    }
}

let platform = process.platform == 'darwin' ? 'macosx' : process.platform == 'linux' ? 'linux' : ''
if (platform) {
    let cflags = sections('appweb-lib.make').get(`release_${platform}`) || ''
    let flags = cflags.replace('$(CFLAGS)', '').replace('$(ALL_CPPFLAGS)', '').trim().split(/\s+/)
    let dir = mkdtempSync(join(tmpdir(), 'werror-'))

    function compiles(name: string, source: string): boolean {
        let path = join(dir, name + '.c')
        writeFileSync(path, source)
        let proc = Bun.spawnSync(['cc', ...flags, '-c', path, '-o', join(dir, name + '.o')], {stderr: 'pipe'})
        return proc.exitCode == 0
    }
    check(compiles('clean', '#include <stdio.h>\nvoid f(const char *s) { printf("%s", s); }\n'),
        'clean code must compile with the release flags')
    check(!compiles('format', '#include <stdio.h>\nvoid f(char *s) { printf(s); }\n'),
        'a non-literal format string must fail the build')
    check(!compiles('undeclared', 'int f(void) { return undeclaredFunction(1); }\n'),
        'a call to an undeclared function must fail the build')
    rmSync(dir, {recursive: true, force: true})
}
