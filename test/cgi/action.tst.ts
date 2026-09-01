/*
    action.tst.ts - The Action directive selects an interpreter for a document

    Action maps a document's MIME type to the program that runs it, so a script can be served
    without being executable and without a #! line. That is the whole point of it: the alternative
    mechanism -- kernel shebang, or prepWinProgram on Windows -- needs the script to be mode 755 and
    to name its own interpreter, and it works whether Action is consulted or not. Which is exactly
    how Action came to be inert in every release without anyone noticing.

    So every case here asserts BOTH halves: the interpreter ran, and the script is NOT executable.
    Drop the mode assertion and someone chmod +x'ing a fixture would leave these passing on the
    shebang path with Action doing nothing again.

    The interpreters are probed rather than assumed, and the probe is for the mapping rather than
    for the interpreter: python3 and php-cgi are not in the Ubuntu container image, and neither
    mapping can run on Windows whether the interpreter is installed or not. See utils/interpreters.ts
    for why. A missing package or a Unix-only wrapper must not read as a server defect.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

import {noInterpreter} from '../utils/interpreters'

const HTTP = 'http://127.0.0.1:4100'
const WEB = resolve(import.meta.dir, '..', 'web')

//  The mode the mechanism exists for: readable, not executable
function notExecutable(path: string) {
    ttrue((statSync(path).mode & 0o111) === 0)
}

async function body(uri: string) {
    const response = await fetch(HTTP + uri)
    teq(response.status, 200)
    return await response.text()
}

//  Action application/x-perl /usr/bin/perl
if (!existsSync('/usr/bin/perl')) {
    tskip('perl case skipped: no /usr/bin/perl')
} else {
    notExecutable(resolve(WEB, 'test.pl'))
    ttrue((await body('/cgi/test.pl')).includes('Hello World from Perl'))
}

//  Action application/x-python ${HOME}/utils/python.cgi, which resolves python3 from PATH
let noPython = noInterpreter('python3')
if (noPython) {
    tskip('python case skipped: ' + noPython)
} else {
    notExecutable(resolve(WEB, 'test.py'))
    ttrue((await body('/cgi/test.py')).includes('Hello world from Python Land!'))
}

/*
    Action application/x-php ${HOME}/utils/php.cgi. This one also pins the ${HOME} expansion: the
    program was tokenized verbatim, so the server looked for a directory literally named "${HOME}"
    and found no interpreter -- the same end state as the lookup defect, from a different cause.
 */
let noPhp = noInterpreter('php-cgi')
if (noPhp) {
    tskip('php case skipped: ' + noPhp)
} else {
    notExecutable(resolve(WEB, 'upload', 'upload.php'))
    ttrue((await body('/php-upload/upload.php')).includes('SERVER=>'))
}
