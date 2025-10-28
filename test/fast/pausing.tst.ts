/*
    Test FAST CGI flow control with paused reading

    This test verifies that the FAST protocol properly handles flow control when
    the client pauses between reads. This forces backpressure on the CGI program
    and tests buffering behavior.
 */

import {tdepth, tget, ttrue} from 'testme'
import {App, ByteArray, File, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
import {contains, keyword, match} from "./fast"

// Test sizes based on test depth
// Depths:    0  1  2  3   4   5   6    7    8    9
let sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]
let len = sizes[tdepth()] * 102400
let bytes = len * 10

let http = new Http
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-b%20" + len)

await http.finalize()
ttrue(http.status == 200)

// Read data with pauses between reads to force flow control
let data = new ByteArray(1024 * 16, false)
let count = 0, n
let fp = new File("pausing.tmp")
await fp.open("w")
while (true) {
    if (http.read(data) == null) {
        break
    }
    await fp.write(data)
    count += data.length
    App.sleep(5)
    if (http.read(data) == null) {
        break
    }
    await fp.write(data)
    count += data.length
}
await fp.close()

ttrue(count >= bytes)
http.close()
new Path("pausing.tmp").remove()
