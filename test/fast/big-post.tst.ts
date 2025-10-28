/*
    Test FAST CGI handling of large POST requests

    This test verifies that FAST programs can receive large POST data via
    streaming writes. The test size scales with test depth (1KB to 64KB).
 */

import {ttrue, tget, tdepth} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http
import {contains, keyword, match} from "./fast"

// Disable timeouts for large data transfer
let limits = http.limits
limits.requestTimeout = 0
limits.inactivityTimeout = 0
http.setLimits(limits)

// Test sizes in KB based on test depth
// Depths:    0  1  2  3   4   5   6   7   8   9
let sizes = [ 1, 2, 4, 8, 12, 16, 24, 32, 40, 64 ]

// Create test buffer with alphabetic pattern
let buf = new ByteArray
for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 15; j++) {
        buf.writeByte("A".charCodeAt(0) + (j % 26))
    }
    buf.writeByte("\n".charCodeAt(0))
}
let count = sizes[tdepth()] * 1024

// Streaming POST with write() + finalize()
http.uri = HTTP + "/fast-bin/fastProgram"
await http.connect('POST')
let written = 0
for (let i = 0; i < count; i++) {
    written += http.write(buf)
}
await http.finalize()
ttrue(http.status == 200)
let len = parseInt(http.response.match(/Post Data ([0-9]+) bytes/)[1])
ttrue(len == written)
http.close()
