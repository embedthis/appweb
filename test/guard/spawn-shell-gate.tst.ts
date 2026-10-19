/*
    spawn-shell-gate.tst.ts - The Windows cmd.exe fallback must stay opt-in, and a request must never opt in
 */

import {teq, ttrue} from '@embedthis/testme'
import {Path} from '@embedthis/ejscript'
import {body, definition, read, stripComments} from './csource.ts'

const ROOT = new Path(import.meta.dir).dirname.dirname
const MPR_H = ROOT.join('src/mpr/mpr.h')
const MPR_C = ROOT.join('src/mpr/mprLib.c')

/*
    Every argv-based spawn that ships. mprStartCmd takes an argv, so its program name is chosen by
    whatever built that argv -- a request, for the CGI handler. None of these may opt into the fallback.
 */
const ARGV_SPAWNS = ['src/modules/cgiHandler.c', 'src/http/httpLib.c']

const FLAG = 'MPR_CMD_ALLOW_SHELL'

//  1. The flag must exist. Without it there is nothing for the gate to test and nothing to opt into
let header = stripComments(await read(MPR_H))
ttrue(new RegExp('#define\\s+' + FLAG + '\\b').test(header),
      FLAG + ' is not defined in mpr.h -- the shell-promotion gate has no flag')

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
      'which is SA-2026-0008 live again')

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
