/*
    groups.tst.ts - Every configuration group must run, or be listed here with a reason

    The runner splits the suite across a group per testme.json5, and the summary line counts what
    ran while saying nothing about what did not. A run that executed 78 of 137 tests and one that
    executed all of them both print PASSED. That is how a group setup failure came to drop 46
    tests without anyone noticing, and how stress/ came to be disabled for long enough that three
    of its files rotted (10069).

    This guard makes the set of non-running groups an assertion. A group that stops running fails
    the suite until someone records why -- which is the whole difference between a decision and a
    drift. It works in both directions: stress/ runs again as of 10069, and had its entry been left
    here the guard would have failed it as a stale record rather than let the note rot in place.

    It cannot detect the third case, a group whose setup fails at run time: the runner aborts the
    remaining groups and this file may not execute at all. Changing that needs a change to TestMe,
    which this feature does not make. What it does cover is the two cases that are decisions
    someone took in a config file, which is where stress/ and bench/ both are.
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const TESTDIR = new Path(import.meta.dir).dirname
const SCANNER = new Path(import.meta.dir).join('scan-groups.sh')

/*
    Groups that are deliberately not part of a default run, each with the reason it is not.
    A group added here without a reason is not a record, it is a place to hide one.
 */
const EXPECTED: any = {
    'bench': {
        state: 'manual',
        why: 'Benchmarks, not tests: minutes of throughput measurement rather than assertions, ' +
             'and bench/setup.sh finds an already-running server rather than starting one.',
    },
}

let out = await Cmd.sh("'" + SCANNER + "' '" + TESTDIR + "'")

let groups: any = {}
for (let line of out.split('\n')) {
    if (line.trim() == '') continue
    let parts = line.trim().split(' ')
    groups[parts[0]] = parts[1]
}

//  The scanner must have found the suite, or every assertion below is vacuous
let names = Object.keys(groups)
ttrue(names.length > 3)
ttrue(groups['.'] == 'enabled')
tinfo('configuration groups: ' + names.length + ' (' +
      names.filter((n: string) => groups[n] == 'enabled').length + ' enabled)')

let unexplained: string[] = []
let stale: string[] = []

for (let name of names) {
    let state = groups[name]
    if (state == 'enabled') {
        //  An entry here for a group that now runs is a stale record, and is also a failure
        if (EXPECTED[name]) {
            stale.push(name + ' runs now, but is still listed as ' + EXPECTED[name].state)
        }
        continue
    }
    if (!EXPECTED[name]) {
        unexplained.push(name + ' is ' + state + ' and no reason is recorded')
    } else if (EXPECTED[name].state != state) {
        unexplained.push(name + ' is ' + state + ', recorded as ' + EXPECTED[name].state)
    }
}

for (let u of unexplained) {
    console.log('UNEXPLAINED GROUP: ' + u)
}
for (let s of stale) {
    console.log('STALE RECORD: ' + s)
}

teq(unexplained.length, 0)
teq(stale.length, 0)

//  Report what is not running, every run, so it stays visible rather than merely recorded
for (let name of Object.keys(EXPECTED)) {
    tinfo(name + ' (' + EXPECTED[name].state + '): ' + EXPECTED[name].why)
}
