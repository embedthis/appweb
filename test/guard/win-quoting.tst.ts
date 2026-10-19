/*
    win-quoting.tst.ts - The Windows command-line encoder must keep its argv boundaries
 */

import {ttrue} from '@embedthis/testme'
import {Path} from '@embedthis/ejscript'
import {definition, read, stripComments} from './csource.ts'

const ROOT = new Path(import.meta.dir).dirname.dirname
const MPR_C = ROOT.join('src/mpr/mprLib.c')

let source = stripComments(await read(MPR_C))

//  1. The encoder must still be there to guard
let prep = definition(source, /static\s+void\s+prepWinCommand\s*\(/g)
ttrue(prep.length > 0, 'prepWinCommand is not defined in the shipped mprLib.c')

/*
    2. The pre-fix guard must be gone. "cp[-1] == '\\'" is the signature of the reverted encoder: it
    is the look-behind that suppressed the escape instead of doubling the run, and nothing in a
    correct implementation needs to look at the character before the cursor.
 */
ttrue(!/cp\[-1\]/.test(prep),
      "prepWinCommand looks behind at cp[-1] again -- that is the earlier encoder, which escapes " +
      'a literal quote only when no backslash precedes it and leaves an argument ending in an odd ' +
      'backslash run unterminated')

/*
    3. The doubling must be there. A run is counted, then emitted at twice its length before the
    closing quote and twice-plus-one before a literal quote. Both multipliers are asserted: an encoder
    that doubles in one position and not the other is the same defect in a narrower window.
 */
ttrue(/\*\s*cp\s*==\s*'\\\\'/.test(prep),
      'prepWinCommand does not count a backslash run -- it cannot be applying the 2N / 2N+1 rule')
ttrue(/\*\s*2\s*\+\s*1/.test(prep),
      'prepWinCommand does not emit 2N+1 backslashes before a literal quote, so the quote it escapes ' +
      'reconstructs the wrong backslash count in the child')
ttrue(/\*=\s*2|\*\s*2\s*[;)]/.test(prep),
      'prepWinCommand does not emit 2N backslashes before the closing quote, so an argument ending in ' +
      'an odd backslash run does not terminate')

/*
    4. No argument may be treated as pre-formatted syntax. The encoder used to skip quoting and
    escaping entirely for an argument beginning with a quote, reading it as "the caller quoted this
    already", so whatever produced that argument chose the token boundaries the child would see -- an
    argument of "a" "b" arrived as two. mprParseArgs turns a backslash-escaped quote into a leading
    one, so the string-command API produces such arguments routinely; test/argv.tst.c upstream pins
    that it does.
 */
ttrue(!/cp\[0\]\s*!=\s*quote/.test(prep),
      'prepWinCommand skips an argument that begins with a quote again -- that is the pass-through ' +
      'that lets one argv element become several in the child')

/*
    5. The shell escaper must not decide from the generated table alone. charMatch is one array for
    every platform and it carries the POSIX branch, so a direct test of it is the defect: it is how
    '%' came to be escaped on no platform at all.
 */
let escape = definition(source, /PUBLIC\s+char\s+\*mprEscapeCmd\s*\(/g)
ttrue(escape.length > 0, 'mprEscapeCmd is not defined in the shipped mprLib.c')
ttrue(!/charMatch\s*\[[^\]]*\]\s*&\s*MPR_ENCODE_SHELL/.test(escape),
      'mprEscapeCmd tests charMatch & MPR_ENCODE_SHELL directly again -- that table is generated once ' +
      'for all platforms and carries the POSIX branch, so the characters cmd.exe adds are escaped nowhere')

/*
    6. And the predicate it uses instead must carry the Windows characters. Named directly, as the
    other guards here name prepWinProgram and COMSPEC: renaming it must bring this guard along.
 */
let predicate = definition(source, /static\s+bool\s+shellEscape\s*\(/g)
ttrue(predicate.length > 0,
      'shellEscape is not defined in the shipped mprLib.c -- mprEscapeCmd has no platform-aware ' +
      'predicate to consult')
ttrue(/ME_WIN_LIKE/.test(predicate),
      'shellEscape is not platform-aware -- the characters it adds are Windows ones and must not be ' +
      'escaped on POSIX, where they are ordinary')
ttrue(predicate.contains("'%'"),
      'shellEscape does not name \'%\' -- mprEncodeGenerate\'s ME_WIN_LIKE branch has always listed it, and ' +
      'this predicate is the only place that listing now takes effect')

/*
    Check both platform tables for carriage-return escaping.
 */
let generate = definition(source, /PUBLIC\s+void\s+mprEncodeGenerate\s*\(/g)
ttrue(generate.length > 0, 'mprEncodeGenerate is not defined in the shipped mprLib.c')
ttrue((generate.match(/\{\}\$\\\\\\n\\r/g) || []).length == 2,
      'mprEncodeGenerate must list \\r beside \\n in both its shell character sets, so a regenerated ' +
      'table escapes a carriage return on every platform')
