/*
    large.tst.ts - Test ESP large response generation
    Verifies that ESP can generate large responses correctly
 */

import {ttrue, tget} from 'testme'
import {ByteArray, Http, print} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

http.get(HTTP + '/big.esp')
await http.finalize()
let buf = new ByteArray
let count = 0
while (http.read(buf) > 0) {
    count += buf.length
}
ttrue(count >= 62401)
http.close()
