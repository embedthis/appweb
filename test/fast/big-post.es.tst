/*
    big-post.tst - FAST Big Post method tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http
load("fast.es")

//  Just for debugging
let limits = http.limits
limits.requestTimeout = 0
limits.inactivityTimeout = 0
http.setLimits(limits)

// Depths:    0  1  2  3   4   5   6   7   8   9 
let sizes = [ 1, 2, 4, 8, 12, 16, 24, 32, 40, 64 ]

//  Create test buffer 
buf = new ByteArray
for (i in 64) {
    for (j in 15) {
        buf.writeByte("A".charCodeAt(0) + (j % 26))
    }
    buf.writeByte("\n".charCodeAt(0))
}
count = sizes[tdepth()] * 1024

//  Simple post
let data = new ByteArray
http.post(HTTP + "/fast-bin/fastProgram")
let written = 0

for (i in count) {
    let n = http.write(buf)
    written += n
}
http.finalize()
ttrue(http.status == 200)
let len = http.response.match(/Post Data ([0-9]+) bytes/)[1]
ttrue(len == written)
http.close()
