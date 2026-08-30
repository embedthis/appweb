/*
    projects.tst.ts - The committed makefiles must be what the generator produces

    projects/gmake2/*.make is generated from projects/premake5.lua. The committed copies used to carry
    78 lines the generator did not produce -- the house build output, applied by hand after generation
    (10237). Two consequences, and the second is the one that matters:

    - Regenerating, which any flag change requires, silently reverted all 78 lines, so a one-line
      hardening change arrived for review as a 79-line diff across seven files.
    - A flag added to a generated file *by hand* built correctly, passed every test, and would vanish
      at the next regeneration with nothing to notice it -- the same shape as a fix written into a
      vendored amalgamation instead of upstream.

    The house style now lives in premake5.lua's own post-generation pass, so the committed files are a
    pure function of the generator. This test is what keeps them that way: it regenerates into a
    scratch tree and diffs. It fails if someone edits a generated makefile, and equally if someone
    edits the generator and does not regenerate.

    Skips where premake5 is not installed, which is the case in CI. That is a stated skip, not a
    silent pass -- the distinction this directory exists to enforce.
 */

import {tinfo, tskip, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const SCRIPT = new Path(import.meta.dir).dirname.dirname.join('bin/verify-projects.sh')

let out = await Cmd.sh("'" + SCRIPT + "' 2>&1; echo \"|EXIT:$?\"")
let parts = out.split('|EXIT:')
let text = parts[0]
let exit = Number(parts[1].trim())

if (text.contains('premake5 not installed')) {
    tskip('premake5 is not installed, so the generator cannot be run')
} else {
    ttrue(exit == 0,
          'projects/gmake2 is not what projects/premake5.lua generates. Never edit a generated ' +
          'makefile -- change the generator and run "cd projects && premake5 gmake":\n' + text)
    tinfo(text.trim())
}
