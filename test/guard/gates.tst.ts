/*
    gates.tst.ts - No test may be gated on a flag the harness does not export
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

const TESTDIR = new Path(import.meta.dir).dirname

/*
    Flags the harness exports. The environment block of testme.json5 is the only place a flag
    can come from, so anything named in a thas() call and absent there is dead by construction.
 */
let config = await Cmd.sh("cat '" + TESTDIR.join('testme.json5') + "'")
let exported: string[] = []
let re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm
let m
while ((m = re.exec(config)) != null) {
    exported.push(m[1])
}

//  The harness must export something, or the parse above is broken and the check below is vacuous
ttrue(exported.length > 0)

/*
    Every live thas('X') call site under test/. The scan is a shell script rather than a grep
    here because comments must be stripped first: Appweb's multi-line comment style carries no
    leading "*" on continuation lines, so a flag named in prose reads exactly like a live gate
    to any line-oriented filter -- and this file's own header names five of them.
 */
let out = await Cmd.sh("'" + new Path(import.meta.dir).join('scan-gates.sh') + "' '" + TESTDIR + "'")

let sites: any[] = []
for (let line of out.split('\n')) {
    if (line.trim() == '') continue
    let hit = /^(.+?):(\d+):(.*)$/.exec(line)
    if (!hit) continue
    let flag = /thas\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\)/.exec(hit[3])
    if (flag) {
        sites.push({file: new Path(hit[1]).basename.toString(), line: hit[2], flag: flag[1]})
    }
}

tinfo('live thas() gates: ' + sites.length + '; flags exported by the harness: ' + exported.length)

let dead: string[] = []
for (let site of sites) {
    if (exported.indexOf(site.flag) < 0) {
        dead.push(site.file + ':' + site.line + " gates on '" + site.flag + "', which the harness does not export")
    }
}
for (let d of dead) {
    console.log('DEAD GATE: ' + d)
}

/*
    Fails closed. A gate on an unexported flag skips its block and still reports PASS, so this
    assertion is the only thing between a silently disabled test and a green run.
 */
teq(dead.length, 0)
