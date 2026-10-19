/*
    post.tst.ts - Stress test a large POST to the static file handler
 */

import {tdepth, tget, ttrue} from '@embedthis/testme'
import {ByteArray, Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

//  Scale POST size with test depth (in KB)
let sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

//  1KB of printable data per iteration
let buf = new ByteArray
for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 15; j++) {
        buf.writeByte('A'.charCodeAt(0) + (j % 26))
    }
    buf.writeByte('\n'.charCodeAt(0))
}
let count = sizes[tdepth()] * 1024

let http: Http = new Http
http.uri = HTTP + '/index.html'
await http.connect('POST')
let written = 0
for (let i = 0; i < count; i++) {
    written += http.write(buf)
}
await http.finalize()

ttrue(written == count * buf.length)
ttrue(http.status == 200)
ttrue(http.response.contains('Hello /index.html'))
http.close()
