/*
    spawn-shell-gate.tst.ts - The Windows cmd.exe fallback must stay opt-in, and a request must never opt in

    prepWinProgram used to promote an extensionless target to "cmd.exe /Q /C <target>" whenever a
    same-named .bat or .cmd file existed. CGI escapes its arguments for a POSIX shell, and that escaping
    does not survive translation to cmd.exe syntax, so an unauthenticated request reached a Windows
    command line: 10155, Critical, SA-2026-0008. The fix made the promotion opt-in behind
    MPR_CMD_ALLOW_SHELL, which only the string-command API asks for -- there the caller handed MPR a
    command line, so a .bat target is what it meant. An argv-based spawn, where the program name comes
    from a request, never asks for it.

    That fix was then silently reverted twice (10297). It had been written into the generated
    amalgamation and never upstream, so two re-imports dropped it while re-establishing agreement
    between the two, and 10155 sat closed and user-verified while the RCE was live again.

    test/guard/amalgamation.tst.ts did not catch it and structurally cannot: it proves the vendored
    files *agree with* their pak sources, and during the reversion they agreed -- the fix was gone from
    both sides. Agreement catches an amalgam-only edit; only presence catches a fix a clean re-import
    drops. Both are needed, so this guard is additional to that one, not a replacement.

    Like test/guard/entropy.tst.ts, this reads the shipped amalgamation -- the file that actually goes
    to a customer -- and asserts the defence is present in it. No host here builds Windows, so no
    functional test can reach this code at all.

    Comments are stripped before matching, because this file's subject matter means the prose around
    each site names the very tokens being asserted.
 */

import {teq, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const ROOT = new Path(import.meta.dir).dirname.dirname
const MPR_H = ROOT.join('src/mpr/mpr.h')
const MPR_C = ROOT.join('src/mpr/mprLib.c')

/*
    Every argv-based spawn that ships. mprStartCmd takes an argv, so its program name is chosen by
    whatever built that argv -- a request, for the CGI handler. None of these may opt into the fallback.
 */
const ARGV_SPAWNS = ['src/modules/cgiHandler.c', 'src/http/httpLib.c']

const FLAG = 'MPR_CMD_ALLOW_SHELL'

function stripComments(text: string): string {
    let out = ''
    let i = 0
    let n = text.length
    while (i < n) {
        if (text[i] == '/' && i + 1 < n && text[i + 1] == '*') {
            let end = text.indexOf('*/', i + 2)
            i = end < 0 ? n : end + 2
            out += ' '
        } else if (text[i] == '/' && i + 1 < n && text[i + 1] == '/') {
            let end = text.indexOf('\n', i)
            i = end < 0 ? n : end
            out += ' '
        } else if (text[i] == '"') {
            //  Keep string literals: the promotion names "cmd.exe", "/Q" and "/C" as strings
            let j = i + 1
            while (j < n && text[j] != '"') {
                j += text[j] == '\\' ? 2 : 1
            }
            out += text.slice(i, Math.min(j + 1, n))
            i = j + 1
        } else {
            out += text[i]
            i++
        }
    }
    return out
}

/*
    Return the body of the function defined at "re", skipping forward declarations. The amalgamation
    declares its statics at the top of each module, so matching the first occurrence of a signature
    lands on a prototype and brace-matches whatever function happens to follow it.
 */
function definition(text: string, re: RegExp): string {
    let m
    re.lastIndex = 0
    while ((m = re.exec(text)) != null) {
        let depth = 0
        let i = text.indexOf('(', m.index)
        for (; i < text.length; i++) {
            if (text[i] == '(') {
                depth++
            } else if (text[i] == ')' && --depth == 0) {
                break
            }
        }
        let j = i + 1
        while (j < text.length && /\s/.test(text[j])) {
            j++
        }
        if (text[j] == '{') {
            return body(text, j)
        }
    }
    return ''
}

//  Return the brace-matched block that follows the offset
function body(text: string, from: number): string {
    let open = text.indexOf('{', from)
    if (open < 0) {
        return ''
    }
    let depth = 0
    for (let i = open; i < text.length; i++) {
        if (text[i] == '{') {
            depth++
        } else if (text[i] == '}') {
            if (--depth == 0) {
                return text.slice(open, i + 1)
            }
        }
    }
    return ''
}

async function read(path: Path): Promise<string> {
    let text = await Cmd.sh("cat '" + path + "'")
    //  Every assertion below is vacuous against an empty read
    ttrue(text.length > 0, 'cannot read ' + path)
    return text
}

//  1. The flag must exist. Without it there is nothing for the gate to test and nothing to opt into
let header = stripComments(await read(MPR_H))
ttrue(new RegExp('#define\\s+' + FLAG + '\\b').test(header),
      FLAG + ' is not defined in mpr.h -- the 10155 gate has no flag')

let source = stripComments(await read(MPR_C))

//  2. The string-command API must keep asking for the fallback: its caller passed a command line
let runCmd = definition(source, /PUBLIC\s+int\s+mprRunCmd\s*\(/g)
ttrue(runCmd.length > 0, 'mprRunCmd is not defined in the shipped mprLib.c')
ttrue(runCmd.contains(FLAG),
      'mprRunCmd no longer sets ' + FLAG + ' -- the string-command API has lost the fallback it is entitled to')

//  3. prepWinProgram must gate the promotion on the flag
let prep = definition(source, /static\s+void\s+prepWinProgram\s*\(/g)
ttrue(prep.length > 0, 'prepWinProgram is not defined in the shipped mprLib.c')
let gate = new RegExp('if\\s*\\(\\s*\\(?\\s*cmd->flags\\s*&\\s*' + FLAG).exec(prep)
ttrue(gate != null,
      'prepWinProgram does not test ' + FLAG + ' -- an extensionless target is promoted to cmd.exe unconditionally, ' +
      'which is 10155 live again')

/*
    4. And the promotion must live inside that gate. A refactor that keeps the flag test but moves the
    cmd.exe substitution out from under it reads as fixed and is not, so assert on the gated block
    rather than on the function.
 */
let gated = body(prep, gate!.index)
ttrue(gated.length > 0, 'the ' + FLAG + ' test in prepWinProgram has no matching block')
for (let token of ['COMSPEC', 'cmd.exe', '/C']) {
    ttrue(gated.contains(token),
          'prepWinProgram builds the cmd.exe command line outside the ' + FLAG + ' gate: "' + token +
          '" is not inside the gated block')
}
//  The unguarded remainder must not build one either
let ungated = prep.replace(gated, ' ')
for (let token of ['COMSPEC', 'cmd.exe']) {
    ttrue(!ungated.contains(token),
          'prepWinProgram names "' + token + '" outside the ' + FLAG + ' gate -- there is a second, ungated path')
}

/*
    5. No argv-based spawn may opt in. mprStartCmd is handed an argv whose program name the caller
    chose, and for the CGI handler that caller is a request. mprRunCmdV callers get the same treatment.
 */
let checked = 0
for (let file of ARGV_SPAWNS) {
    let text = stripComments(await read(ROOT.join(file)))
    let re = /mprStartCmd\s*\(|mprRunCmdV\s*\(/g
    let call
    while ((call = re.exec(text)) != null) {
        let end = text.indexOf(';', call.index)
        let args = text.slice(call.index, end < 0 ? text.length : end)
        ttrue(!args.contains(FLAG),
              file + ' passes ' + FLAG + ' to an argv-based spawn: a request-driven program name must never ' +
              'reach the cmd.exe fallback')
        checked++
    }
}

/*
    The CGI handler's spawn and the monitor remedy's spawn are the two that ship. Finding fewer means
    a call site moved out of reach of this scan and stopped being covered.
 */
teq(checked >= 2, true, 'expected at least 2 argv-based spawn sites, found ' + checked)
