/*
    filenames.tst.ts - Client filenames hazardous on disk are refused
 */

import {teq, ttrue} from '@embedthis/testme'
import {CGI_UPLOAD, upload} from './multipart'

const REFUSED = ['report.txt:hidden', 'report.txt::$DATA', 'shell.php.', 'shell.php ', 'CON', 'CON.txt',
    'lpt1', 'nul.tar.gz', '%2e%2e%2fescape.txt', '.hidden', 'CON .txt', 'AUX  .log', 'CONIN$', 'INDEX~1.HTM']
const ACCEPTED = ['report.txt', 'my report.txt', 'a-b_c.tar.gz', 'console.txt', 'COM10']

async function send(filename: string): Promise<number> {
    let reply = await upload(CGI_UPLOAD, [{name: 'file', filename, contentType: 'text/plain', value: 'data'}])
    return reply.status
}

for (let name of REFUSED) {
    let status = await send(name)
    if (status != 400) {
        console.log(`"${name}" answered ${status}`)
    }
    teq(status, 400)
}
for (let name of ACCEPTED) {
    let status = await send(name)
    if (status != 200) {
        console.log(`"${name}" answered ${status}`)
    }
    ttrue(status == 200)
}
