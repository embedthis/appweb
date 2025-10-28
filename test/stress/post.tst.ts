/*
    post.tst.ts - Stress test large POST data to various handlers
    Verifies that handlers can receive large POST bodies
 */

import {print, tdepth, tget, thas, ttrue} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http

//  Scale POST size with test depth
var sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

//  Create test buffer
let buf = new ByteArray
for (let i in 64) {
    for (let j in 15) {
        buf.writeByte('A'.charCodeAt(0) + (j % 26))
    }
    buf.writeByte('\n'.charCodeAt(0))
}

//  Scale the count by the test depth
let count = sizes[tdepth()] * 1024

//  Helper to POST large data to endpoint
async function postTest(url: String) {
    http.post(HTTP + url)
    await http.finalize()
    for (let i in count) {
        let n = http.write(buf)
    }
    http.wait(120 * 1000)
    ttrue(http.status == 200)
    ttrue(http.response)
    http.close()
}

//  Test static file handler
postTest('/index.html')

//  Test ESP handler if enabled
if (thas('ME_ESP')) {
    postTest('/stream.esp')
}

//  Test CGI handler if enabled
if (thas('ME_CGI')) {
    postTest('/cgi-bin/cgiProgram')
}
