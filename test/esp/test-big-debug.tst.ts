/*
    test-big-debug.tst.ts - Debug test for ESP large response reading
    Tests HTTP client response reading loop with large content
 */

import {ttrue, tget} from 'testme'
import {ByteArray, Http, print} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/big.esp")
await http.finalize()

let buf = new ByteArray
let count = 0
let iterations = 0
let readResult
while ((readResult = http.read(buf)) > 0) {
    iterations++
    count += buf.length
    if (iterations > 100) {
        break
    }
}
ttrue(count >= 62401)
http.close()
