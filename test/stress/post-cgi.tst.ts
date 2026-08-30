/*
    post-cgi.tst.ts - Stress test a large POST through the CGI handler

    Unlike the file handler, CGI must carry every byte of the body through to the child process
    and report back how many it received. That count is the assertion: a body truncated anywhere
    between the socket and the child shows up here and nowhere else.

    Split from post.tst.ts, which covers the file handler. Both in one file hangs on the second
    request -- the Ejscript HTTP client does not recover its connection after a large streaming
    POST whose response arrives before the body is fully written. Appweb serves the same pair over
    one connection in 240ms, so the split works around a client limitation, not a server one.
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
http.uri = HTTP + '/cgi-bin/cgiProgram'
await http.connect('POST')
let written = 0
for (let i = 0; i < count; i++) {
    written += http.write(buf)
}
await http.finalize()

ttrue(written == count * buf.length)
ttrue(http.status == 200)

//  The CGI program echoes the byte count it read from stdin
let len = http.response.match(/Post Data ([0-9]+) bytes/)?.[1]
ttrue(len == String(written))
http.close()
