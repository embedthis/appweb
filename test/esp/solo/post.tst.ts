/*
    post.tst.ts - ESP POST streaming test
    Verifies that ESP can handle large POST request bodies with streaming
 */

import {tdepth, tget, thas, ttrue} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

var sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

let buf = new ByteArray
for (let i in 64) {
    for (let j in 15) {
        buf.writeByte("A".charCodeAt(0) + (j % 26))
    }
    buf.writeByte("\n".charCodeAt(0))
}

let count = sizes[tdepth()] * 16

async function postTest(url: String) {
    http.post(HTTP + url)
    for (let i in count) {
        http.write(buf)
    }
    await http.finalize()
    await http.wait(120 * 1000)
    ttrue(http.status == 200)
    ttrue(http.response)
    http.close()
}

if (thas('ME_ESP')) {
    postTest("/solo/stream")
}
