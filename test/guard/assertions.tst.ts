/*
    assertions.tst.ts - No test file may pass while asserting nothing
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const TESTDIR = new Path(import.meta.dir).dirname
const SCANNER = new Path(import.meta.dir).join('scan-assertions.sh')

let out = await Cmd.sh("'" + SCANNER + "' '" + TESTDIR + "'")

let inert: string[] = []
for (let line of out.split('\n')) {
    if (line.trim() != '') {
        inert.push(line.trim())
    }
}

/*
    Sanity check on the scanner itself. If it reports nothing because it found no files at all,
    the assertion below would pass vacuously -- the exact failure mode this guard exists to
    prevent, reproduced inside the guard.
 */
let total = await Cmd.sh("find '" + TESTDIR + "' -name '*.tst.ts' -not -path '*/node_modules/*' " +
    "-not -path '*/.testme/*' | wc -l")
let count = Number(total.trim())
tinfo('test files scanned: ' + count + '; inert: ' + inert.length)
ttrue(count > 50)

for (let f of inert) {
    console.log('INERT: ' + f + ' asserts nothing and never skips')
}

teq(inert.length, 0)
