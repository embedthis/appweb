/*
    big.tst - Various Http read tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Test http.read() into a byte array
http.get(HTTP + "/big.esp")
buf = new ByteArray
count = 0
while (http.read(buf) > 0) {
    count += buf.length
}
if (count != 62401) {
    print("COUNT IS " + count + " code " + http.status)
}
ttrue(count == 62401)
http.close()
