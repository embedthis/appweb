/*
    hardening.tst.ts - The generated makefiles request the compiler and linker hardening
 */

import {ttrue} from '@embedthis/testme'
import {readdirSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const DIR = resolve(import.meta.dir, '../../projects/gmake2')

function check(ok: boolean, what: string): void {
    if (!ok) {
        console.log(what)
    }
    ttrue(ok)
}

for (let file of readdirSync(DIR).filter(f => f.endsWith('.make'))) {
    let text = readFileSync(resolve(DIR, file), 'utf8')
    let sections = text.split(/\n(?:else )?ifeq \(\$\(config\),/).slice(1)
    for (let section of sections) {
        let config = section.slice(0, section.indexOf(')'))
        let [build, platform] = config.split('_')
        let cflags = (/ALL_CFLAGS \+=.*/.exec(section) || [''])[0]
        let ldflags = (/ALL_LDFLAGS \+=.*/.exec(section) || [''])[0]
        let where = `${file} ${config}`

        check(cflags.includes('-fstack-protector-strong'), `${where}: no -fstack-protector-strong`)
        let stripped = /\s-s(\s|$)/.test(ldflags)
        if (build == 'test') {
            //  The sanitizer job builds this configuration; a stripped binary leaves its reports unresolvable
            check(!stripped, `${where}: test configuration is stripped`)
        }
        if (platform == 'linux' || platform == 'freebsd') {
            check(ldflags.includes('-Wl,-z,relro,-z,now'), `${where}: no RELRO and BIND_NOW`)
            check(ldflags.includes('-Wl,-z,noexecstack'), `${where}: no non-executable stack`)
            check(!ldflags.includes('noexecheap'), `${where}: noexecheap is not a linker option`)
            check(cflags.includes('-fstack-clash-protection'), `${where}: no stack clash protection`)
            if (build == 'release') {
                check(stripped, `${where}: release configuration is not stripped`)
            }
            //  Level 3 is the Ubuntu 24.04 compiler default; asking for less lowers it
            let fortify = cflags.includes('-D_FORTIFY_SOURCE=3')
            check(fortify == (build != 'debug'), `${where}: FORTIFY ${fortify ? 'set' : 'missing'}`)
            if (!file.startsWith('appweb-lib')) {
                check(cflags.includes('-fPIE') && ldflags.includes('-pie'), `${where}: not built as PIE`)
            }
        }
    }
}
