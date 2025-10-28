/*
    stream.tst - Http tests using streams

    Tests HTTP response reading using TextStream wrapper to read line-by-line
    from large responses. Validates streaming functionality and content integrity.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http, TextStream} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_EJS')) {
    // Test reading large response using TextStream
    http.get(HTTP + "/big.ejs")
    await http.finalize()
    let ts = new TextStream(http)
    let lines = ts.readLines()
    ttrue(lines.length == 801)
    ttrue(lines[0].contains("aaaaabbb") && lines[0].contains("00000"))
    ttrue(lines[799].contains("aaaaabbb") && lines[799].contains("00799"))
    http.close()

} else {
    tskip("ejs not enabled")
}
