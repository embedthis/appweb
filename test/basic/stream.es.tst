/*
    stream.tst - Http tests using streams
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_EJS')) {
    http.get(HTTP + "/big.ejs")
    ts = new TextStream(http)
    lines = ts.readLines()
    ttrue(lines.length == 801)
    ttrue(lines[0].contains("aaaaabbb") && lines[0].contains("00000"))
    ttrue(lines[799].contains("aaaaabbb") && lines[799].contains("00799"))
    http.close()

} else {
    tskip("ejs not enabled")
}
