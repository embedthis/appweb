/*
    assertions.tst.ts - No test file may pass while asserting nothing

    A .tst.ts file that executes no assertion and never calls tskip() reports PASS, and in the
    summary line that is indistinguishable from coverage. basic/dir.tst.ts and
    stress/hugeForm.tst.ts were exactly that: every assertion commented out, ttrue imported and
    never called, PASS in 30ms (10062). Four regress files were the same shape with the
    assertions never written rather than commented out (10063).

    The check is static, not dynamic, for the same reason the gate guard is: an absent assertion
    produces no runtime signal. A file that asserts nothing simply passes.

    Delegation is handled -- six files in the suite assert entirely through shared helpers
    (./raw, ./cgi, ./fast) and are among the best tests here. See scan-assertions.sh.
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
