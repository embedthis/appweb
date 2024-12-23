/*
    post.tst - Stress test post data
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

/* Depths:    0  1  2  3   4   5   6    7    8    9    */
var sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

//  Create test buffer
buf = new ByteArray
for (i in 64) {
    for (j in 15) {
        buf.writeByte("A".charCodeAt(0) + (j % 26))
    }
    buf.writeByte("\n".charCodeAt(0))
}

//  Scale the count by the test depth
count = sizes[tdepth()] * 1024

function postTest(url: String) {
    http.post(HTTP + url)
    // print("Count " + count + " buf " + buf.length + " total " + count * buf.length)
    for (i in count) {
        let n = http.write(buf)
        // print('WROTE', n)
    }
    http.wait(120 * 1000)
    if (http.status != 200) {
        print("STATUS " + http.status)
        print(http.response)
    }
    ttrue(http.status == 200)
    ttrue(http.response)
    http.close()
}

postTest("/index.html")

if (thas('ME_ESP')) {
    postTest("/stream.esp")
}

if (thas('ME_CGI')) {
    postTest("/cgi-bin/cgiProgram")
}
