/*
    entropy.tst.ts - Every platform's mprGetRandomBytes must draw on a system CSPRNG or fail

    mprGetRandomBytes has one contract: it returns cryptographically strong bytes or it fails. The
    callers are the server secret that keys the Digest nonce, the session id, the CSRF token and the
    WebSocket masking key -- values a caller cannot tell apart from random once substituted.

    The VxWorks implementation broke that contract for the life of the product and nothing noticed
    (10088). It filled the buffer from rand(), seeded once by mprCreate() from time(NULL) at one
    second resolution, and returned success unconditionally. Capturing one Digest challenge and
    enumerating the boot second recovered the secret. The fail-closed work that preceded it (10023)
    hardened the Unix and Windows paths and left this one satisfying the contract trivially.

    No host in this suite builds VxWorks, and none builds Windows either, so no functional test can
    ever reach two of the three implementations. That is what this guard is for: it reads the
    shipped amalgamation, which is the source that actually goes to a customer.

    Comments are stripped before matching. Appweb's multi-line comment style carries no leading "*"
    on continuation lines, and this file's own subject matter means the prose around each
    implementation names rand() and every source below -- so any line-oriented filter would read
    the explanation as the code.
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {Path} from '@embedthis/ejscript'
import {body, read, stripComments} from './csource.ts'

const SRC = new Path(import.meta.dir).dirname.dirname.join('src/mpr/mprLib.c')

/*
    System random sources this project accepts. A platform implementation must name one of these:
    a new platform arriving with its own scheme fails here and has to be reviewed rather than
    inherited. The failure message says so.
 */
const SOURCES: any = {
    '/dev/urandom': 'Unix',
    '/dev/random': 'Unix blocking',
    CryptGenRandom: 'Windows',
    randBytes: 'VxWorks 7 randomNumGen',
    randABytes: 'VxWorks 7 randomNumGen blocking',
}

//  Weak PRNGs. Reaching for either inside this function is the defect, whatever else the body does.
const WEAK = ['rand', 'random', 'srand', 'mprRandom']

let source = stripComments(await read(SRC))

//  The amalgamation must have been read, or every check below is vacuous
ttrue(source.length > 0)

let bodies: string[] = []
let re = /PUBLIC\s+int\s+mprGetRandomBytes\s*\(/g
let m
while ((m = re.exec(source)) != null) {
    let text = body(source, m.index)
    ttrue(text.length > 0, 'mprGetRandomBytes definition at offset ' + m.index + ' has no matching body')
    bodies.push(text)
}

/*
    Three implementations ship: Unix, VxWorks and Windows. A fourth appearing means a platform was
    added without this guard being told, and a count below three means one was dropped or renamed
    out of reach of the scan -- either way the assertions below stop covering what they claim to.
 */
teq(bodies.length, 3, 'expected 3 mprGetRandomBytes implementations, found ' + bodies.length)

for (let text of bodies) {
    let named: string[] = []
    for (let name of Object.keys(SOURCES)) {
        if (text.contains(name)) {
            named.push(SOURCES[name])
        }
    }
    ttrue(named.length > 0,
          'an mprGetRandomBytes implementation names no recognized system random source: ' +
          text.slice(0, 200))
    tinfo('mprGetRandomBytes: ' + named.join(', '))

    for (let weak of WEAK) {
        let hit = new RegExp('\\b' + weak + '\\s*\\(').test(text)
        ttrue(!hit, 'mprGetRandomBytes calls ' + weak + '(): a weak PRNG is not a random source')
    }

    /*
        It must be able to fail. An implementation that only ever returns 0 satisfies every caller's
        error check trivially, which is exactly how the VxWorks version passed for so long.
     */
    ttrue(text.contains('MPR_ERR_') || text.contains('mprGetError'),
          'an mprGetRandomBytes implementation has no failure return, so its callers cannot fail closed')
}
