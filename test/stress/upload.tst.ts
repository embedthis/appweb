/*
    upload.tst.ts - Stress test file uploads
    Verifies that large file uploads work correctly
 */

import {tdepth, tget, thas, tskip, ttrue} from 'testme'
import {App, ByteArray, Cmd, File, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const TESTFILE = 'upload-' + App.pid + '.tdat'

//  Only run if EJS is enabled
if (thas('ME_EJS')) {
    let http: Http = new Http

    //  Scale upload size with test depth
    var sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

    //  Create test data buffer
    let buf = new ByteArray
    for (let i in 64) {
        for (let j in 15) {
            buf.writeByte('A'.charCodeAt(0) + (j % 26))
        }
        buf.writeByte('\n'.charCodeAt(0))
    }

    //  Create test file
    f = new File(TESTFILE).open({mode: 'w'})
    for (let i in (sizes[tdepth()] * 1024)) {
        f.write(buf)
    }
    f.close()

    size = new Path(TESTFILE).size

    //  Upload test file
    await http.upload(HTTP + '/upload.ejs', {file: TESTFILE})
    ttrue(http.status == 200)
    http.close()

    //  Verify uploaded file matches
    let uploaded = new Path('../web/tmp').join(new Path(TESTFILE).basename)
    ttrue(uploaded.size == size)
    Cmd.sh('diff ' + uploaded + ' ' + TESTFILE)

    new Path(TESTFILE).remove()

} else {
    tskip('ejs not enabled')
}
