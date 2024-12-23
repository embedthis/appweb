/*
    big-response.tst - FAST big response data
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
load("fast.es")

// Depths:    0  1  2  3   4   5   6    7    8    9 
let sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]
let lines = sizes[tdepth()] * 10240

let http = new Http
http.setHeader("SWITCHES", "-b%20" + lines)
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(http.status == 200)

let len = lines * 10
if (len > http.response.length) {
    print(lines, '\n', http.response.length)
}
ttrue(len <= http.response.length)
http.close()
