/*
    read.tst - Various Http read tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

/*  TODO
//  Validate readXml()
http.get(HTTP + "/test.xml")
ttrue(http.readXml().customer.name == "Joe Green")
*/

if (thas('ME_EJS')) {
    //  Test http.read() into a byte array
    http.get(HTTP + "/big.ejs")
    buf = new ByteArray
    count = 0
    while (http.read(buf) > 0) {
        count += buf.length
    }
    if (count != 63201) {
        print("COUNT IS " + count + " code " + http.status)
    }
    ttrue(count == 63201)
    http.close()
}

http.get(HTTP + "/lines.txt")
lines = http.readLines()
for (l in lines) {
    line = lines[l]
    ttrue(line.contains("LINE"))
    ttrue(line.contains((l+1).toString()))
}
ttrue(http.status == 200)
http.close()
