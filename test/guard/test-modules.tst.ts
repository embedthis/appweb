/*
    test-modules.tst.ts - Only the test configuration carries the test handler modules
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const TOP = resolve(import.meta.dir, '../..')

let header = readFileSync(resolve(TOP, 'src/appweb.h'), 'utf8')
ttrue(/#define ME_COM_TEST 0\b/.test(header))
ttrue(/#define ME_COM_TEST_WEBSOCKETS 0\b/.test(header))

let make = readFileSync(resolve(TOP, 'projects/gmake2/appweb-lib.make'), 'utf8')
let sections = make.split(/\nifeq \(\$\(config\),|\nelse ifeq \(\$\(config\),/).slice(1)
ttrue(sections.length > 0)
for (let section of sections) {
    let name = section.slice(0, section.indexOf(')'))
    let enabled = section.includes('-DME_COM_TEST=1')
    if (enabled != name.startsWith('test_')) {
        console.log(`configuration ${name}: test modules ${enabled ? 'enabled' : 'disabled'}`)
    }
    ttrue(enabled == name.startsWith('test_'))
}
