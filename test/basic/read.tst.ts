/*
    read.tst.ts - Response reading

    Covers reading a response into a ByteArray in chunks, and reading it as lines.

    The ByteArray case was previously gated on thas('ME_EJS') against a big.ejs endpoint that is
    neither built nor served, so it never ran (10061). Retargeted at web/100K.txt, which prep.sh
    generates at a known size.
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {ByteArray, Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Read a large response into a byte array, accumulating across reads
http.get(HTTP + "/100K.txt")
await http.finalize()
teq(http.status, 200)

let buf = new ByteArray
let count = 0
while (http.read(buf) > 0) {
    count += buf.length
}
teq(count, 102516)
http.close()

//  Read a response as lines
http.get(HTTP + "/lines.txt")
await http.finalize()
teq(http.status, 200)

let lines = http.readLines()
ttrue(lines.length > 0)
for (let l in lines) {
    let line = lines[l]
    ttrue(line.contains("LINE"))
    ttrue(line.contains((Number(l) + 1).toString()))
}
http.close()
