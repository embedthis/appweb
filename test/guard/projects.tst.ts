/*
    projects.tst.ts - The committed makefiles must be what the generator produces
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
