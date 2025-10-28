/*
    big-post.tst.ts - Test large CGI POST requests
    Verifies that CGI can handle large streaming POST data
 */

import {ttrue, tget, tdepth} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http
import {contains, keyword, match} from './cgi'

//  Test sizes scale with depth (in KB)
let sizes = [1, 2, 4, 8, 12, 16, 24, 32, 40, 64]

//  Create test buffer (64 bytes per iteration)
let buf = new ByteArray
for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 15; j++) {
        buf.writeByte('A'.charCodeAt(0) + (j % 26))
    }
    buf.writeByte('\n'.charCodeAt(0))
}
let count = sizes[tdepth()] * 1024

//  Stream large POST data to CGI
http.uri = HTTP + '/cgi-bin/cgiProgram'
http.connect('POST')
let written = 0
for (let i = 0; i < count; i++) {
    written += http.write(buf)
}
await http.finalize()

//  Verify CGI received all data
ttrue(http.status == 200)
let len = http.response.match(/Post Data ([0-9]+) bytes/)?.[1]
ttrue(len == String(written))
http.close()
