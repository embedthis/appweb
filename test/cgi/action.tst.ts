/*
    Action must run non-executable scripts through the configured interpreter. Check the file mode to exclude
    shebang execution. Probe each mapping for platform support; the .act fixture runs everywhere.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, readFileSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

import {noInterpreter} from '../utils/interpreters'
import {WINDOWS} from '../utils/gateways'

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

/*
    The shebang-free .act fixture verifies that Action selected the interpreter on Windows.
 */
{
    const fixture = resolve(WEB, 'action.act')
    ttrue(!readFileSync(fixture, 'utf8').startsWith('#!'))
    if (!WINDOWS) {
        notExecutable(fixture)
    }
    const text = await body('/cgi/action.act?switches=-a')
    ttrue(/ARG\[0\]=[^<]*cgiProgram/.test(text))
    ttrue(/ARG\[1\]=[^<]*action\.act</.test(text))
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
