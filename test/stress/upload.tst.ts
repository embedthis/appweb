/*
    upload.tst.ts - Stress test file uploads
 */

import {tdepth, tget, ttrue} from '@embedthis/testme'
import {App, ByteArray, File, Http, Path} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const TESTFILE = 'upload-' + App.pid + '.tdat'

//  Scale upload size with test depth (in KB)
let sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

//  1KB of printable data per iteration
let buf = new ByteArray
for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 15; j++) {
        buf.writeByte('A'.charCodeAt(0) + (j % 26))
    }
    buf.writeByte('\n'.charCodeAt(0))
}

let local = new Path(TESTFILE)

try {
    let f = await new File(TESTFILE).open({mode: 'w'})
    for (let i = 0; i < sizes[tdepth()] * 1024; i++) {
        await f.write(buf)
    }
    f.close()

    let size = local.size
    ttrue(size == sizes[tdepth()] * 1024 * buf.length)

    let http: Http = new Http
    http.upload(HTTP + '/upload/cgiProgram.cgi', {file: TESTFILE})
    await http.finalize()
    ttrue(http.status == 200)

    /*
        The CGI reports what the upload filter handed it. A truncated upload shows a short count
        here -- which is the whole point of sending a large one.
     */
    let response = http.response
    ttrue(response.contains('CGI_FILE_1_SIZE=' + size))
    ttrue(response.contains('CGI_FILE_1_CLIENT_FILENAME=' + TESTFILE))
    http.close()

} finally {
    /*
        Remove the payload even when an assertion above fails. Without this a failing run left an
        upload-<pid>.tdat in the test directory for every attempt, and they accumulate untracked.
     */
    if (local.exists) {
        await local.remove()
    }
}
