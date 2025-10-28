/*
    huge.tst.ts - Test huge file downloads and range requests
    Verifies that server can handle very large files (5GB) and range requests
 */

import {tdepth, tget, tinfo, tskip, ttrue} from 'testme'
import {ByteArray, File, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const TIMEOUT = 10000
const HUGE= '../web/200M.txt'
var SIZE = 5 * 1024 * 1024 * 1024
let http: Http = new Http

//  Only run at high test depths
if (tdepth() >= 6) {
    //  Create 5GB test file if needed
    if (!new Path(HUGE).exists || new Path(HUGE).size < SIZE) {
        tinfo('\n  [Generate] Huge 5GB test file "' + HUGE + '" ...')
        let data = new ByteArray
        for (let i in 1024) {
            data.write('%05d 0123456789012345678901234567890123456789012345678', i)
        }
        let f = new File(HUGE, 'w')
        while (new Path(HUGE).size < SIZE) {
            f.write(data)
        }
        f.close()
        tinfo('\n      [Test] GET "' + HUGE + '" ...')
    }
    SIZE = new Path(HUGE).size

    //  Test streaming large file download
    let total, count, complete
    http.async = true
    http.setLimits({receive: 10 * 1024 * 1024 * 1024})
    var buf = new ByteArray
    http.on('readable', function (event, http) {
        buf.flush()
        let count = http.read(buf, -1)
        total += count
    })
    http.on('close', function (event, http) {
        complete = true
    })
    http.get(HTTP + '/200M.txt')
    await http.finalize()
    let mark = new Date
    http.wait(-1)
    ttrue(complete)
    ttrue(total == SIZE)
    ttrue(http.status == 200)
    http.close()

    //  Test range request - first 5 bytes
    http.setHeader('Range', 'bytes=0-4')
    http.get(HTTP + '/100K.txt')
    await http.finalize()
    ttrue(http.status == 206)
    ttrue(http.response == '01234')
    http.close()

    //  Test range request - last 5 bytes
    http.setHeader('Range', 'bytes=-5')
    http.get(HTTP + '/100K.txt')
    await http.finalize()
    ttrue(http.status == 206)
    ttrue(http.response.trim() == 'MENT')
    http.close()

    //  Test range request - from position to end
    http.setHeader('Range', 'bytes=117000-')
    http.get(HTTP + '/100K.txt')
    await http.finalize()
    ttrue(http.status == 206)
    ttrue(http.response.trim() == 'END OF DOCUMENT')
    http.close()

    //  Test multiple ranges
    http.setHeader('Range', 'bytes=0-5,25-30,-5')
    http.get(HTTP + '/100K.txt')
    await http.finalize()
    ttrue(http.status == 206)
    ttrue(http.response.contains('Content-Range: bytes 0-5/117016'))
    ttrue(http.response.contains('Content-Range: bytes 25-30/117016'))
    ttrue(http.response.contains('Content-Range: bytes 117011-117015/117016'))
    ttrue(http.response.contains('012345'))
    ttrue(http.response.contains('567890'))
    ttrue(http.response.contains('MENT'))
    http.close()

} else {
    tskip('runs at depth 6')
}
