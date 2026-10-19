/*
    windows-cet.tst.ts - Every Windows configuration links CET compatible and keeps Control Flow Guard
 */

import {ttrue} from '@embedthis/testme'
import {readdirSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const VS = resolve(import.meta.dir, '../../projects/vs2022')

function check(ok: boolean, what: string): void {
    if (!ok) {
        console.log(what)
    }
    ttrue(ok)
}

let projects = readdirSync(VS).filter(f => f.endsWith('.vcxproj'))
check(projects.length > 0, `no projects in ${VS}`)

for (let file of projects) {
    let text = readFileSync(resolve(VS, file), 'utf8')
    let links = text.match(/<Link>[\s\S]*?<\/Link>/g) || []
    check(links.length > 0, `${file}: no link settings`)
    for (let link of links) {
        check(link.includes('/CETCOMPAT'), `${file}: a configuration links without /CETCOMPAT`)
        check(link.includes('/guard:cf'), `${file}: a configuration links without /guard:cf`)
    }
    check(!text.includes('<DebugInformationFormat>EditAndContinue'), `${file}: /ZI conflicts with /guard:cf`)
    check(!text.includes('<LinkIncremental>true'), `${file}: incremental linking conflicts with /guard:cf`)
}
