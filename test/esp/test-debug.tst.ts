/*
    test-debug.tst.ts - Debug test for ESP HTTP client internals
    Tests HTTP client internal state during response reading
 */

import {tget} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/big.esp")
await http.finalize()

let httpAny = http as any
let buf = new ByteArray()

try {
    let firstRead = http.read(buf)
} catch (e: any) {
}

http.close()
