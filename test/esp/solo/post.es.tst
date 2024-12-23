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
count = sizes[tdepth()] * 16

function postTest(url: String) {
    http.post(HTTP + url)
    for (i in count) {
        http.write(buf)
    }
    http.wait(120 * 1000)
    ttrue(http.status == 200)
    ttrue(http.response)

    if (http.status != 200) {
        print("STATUS " + http.status)
        print(http.response)
    }
    http.close()
}

if (thas('ME_ESP')) {
    postTest("/solo/stream")
}
