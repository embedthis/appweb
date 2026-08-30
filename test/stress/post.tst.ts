/*
    post.tst.ts - Stress test a large POST to the static file handler

    The file handler does not want the body, so this asserts that a large one is consumed and
    discarded without stalling the request: the document is still served, in full, with a 200.

    Three separate faults kept this from running (10069). The buffer loops were
    `for (let i in 64)`, which iterates a Number's properties and so never executed, leaving an
    empty buffer. The write loop ran after `finalize()` rather than before it, so `http.status`
    was read while the request was still pending and threw. And the calls were not awaited, so the
    file finished before either had completed. The idiom below -- connect, write, finalize, then
    read status -- is the one cgi/big-post and fast/big-post use.

    The CGI case lives in post-cgi.tst.ts rather than here. Both in one file hangs on the second
    request: the Ejscript HTTP client does not recover its connection after a large streaming POST
    whose response arrives before the body is fully written. Appweb serves the same pair over one
    connection in 240ms, so the split is around a client limitation, not a server one.
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
