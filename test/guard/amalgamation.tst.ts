/*
    amalgamation.tst.ts - The amalgamated sources must match their pak sources

    src/http/httpLib.c (about 1.0 MB), src/mpr/mprLib.c (about 0.9 MB), their headers and
    src/osdep/osdep.h are generated from the per-module dist directories under paks by
    "make cache" and "pak sync". Nothing verified they still matched (10070). The upstream mpr and
    http suites test the upstream sources; Appweb's suite does not run them. A dropped or mangled
    hunk from a bad import would therefore be caught only by whatever Appweb functional coverage
    happens to touch the damaged code -- and for osdep.h there is none, because what it gates is
    which targets compile at all.

    paks/ is gitignored, so it is absent in a fresh clone and in every git worktree. That is an
    explicit skip with a true reason, not a silent pass -- the distinction this whole guard
    directory exists to enforce.
 */

import {teq, tinfo, tskip, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const SCRIPT = new Path(import.meta.dir).dirname.join('utils/check-amalgamation.sh')

//  The script reports its verdict in the exit status; capture both it and the output
let out = await Cmd.sh("'" + SCRIPT + "' 2>&1; echo \"|EXIT:$?\"")
let parts = out.split('|EXIT:')
let text = parts[0]
let exit = Number(parts[1].trim())

/*
    Files known to diverge, each with the issue that tracks it. Empty is the correct state.

    It was not empty: paks/mpr/dist carried pre-fix code under the same 9.2.0 version as the
    published pak, so #10023 and #10056 would have been reverted by an import. Cleared 2026-08-07
    by refreshing the local pak from ~/.paks -- see #10132 for why the version number could not
    distinguish the two.

    An entry here that stops diverging fails the run, so an exemption cannot outlive its defect.
    That is how this one was found to be stale within minutes of the fix.
 */
const KNOWN: any = {
}

if (exit == 2) {
    tinfo(text.trim())
    tskip('paks/ is gitignored and absent here; run in a full checkout to verify the amalgamation')

} else {
    //  Verified or divergent -- either way the script must have said which
    ttrue(text.length > 0)

    let diverged: string[] = []
    for (let line of text.split('\n')) {
        let m = /^FAIL: (\S+) differs from/.exec(line.trim())
        if (m) {
            diverged.push(m[1])
        }
    }

    let unexpected = diverged.filter((f: string) => !KNOWN[f])
    let stale = Object.keys(KNOWN).filter((f: string) => diverged.indexOf(f) < 0)

    for (let f of unexpected) {
        console.log('UNEXPECTED DIVERGENCE: ' + f + ' differs from its pak source and is not tracked')
    }
    for (let f of stale) {
        console.log('STALE EXEMPTION: ' + f + ' matches its pak source now; remove it from KNOWN')
    }
    for (let f of diverged) {
        if (KNOWN[f]) {
            tinfo('known divergence: ' + f + ' (' + KNOWN[f] + ')')
        }
    }

    teq(unexpected.length, 0)
    teq(stale.length, 0)

    //  With nothing diverging at all, the script must have said so rather than found no files
    if (diverged.length == 0) {
        ttrue(text.contains('match their pak sources'))
    }
}
