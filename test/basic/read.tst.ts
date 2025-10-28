/*
    read.tst - Various Http read tests

    Tests different HTTP response reading methods including reading into byte arrays,
    reading line-by-line, and validating response content.

    TODO - Add XML reading tests when XML support is available
 */

import {thas, ttrue, tget} from 'testme'
import {ByteArray, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_EJS')) {
    // Test reading response into a byte array with chunked reading
    http.get(HTTP + "/big.ejs")
    await http.finalize()
    let buf = new ByteArray
    let count = 0
    while (http.read(buf) > 0) {
        count += buf.length
    }
    ttrue(count == 63201)
    http.close()
}

// Test reading response as lines
http.get(HTTP + "/lines.txt")
await http.finalize()
let lines = http.readLines()
for (let l in lines) {
    let line = lines[l]
    ttrue(line.contains("LINE"))
    ttrue(line.contains((Number(l)+1).toString()))
}
ttrue(http.status == 200)

http.close()
