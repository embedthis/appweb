/*
    foreign.tst - Stress test foreign threads
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

var iterations = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

let http: Http = new Http

let uri = HTTP + "/foreign"
let count = iterations[tdepth()] * 100

tinfo("Request", "/foreign", count, "times")
for (let i = 0; i < count; i++) {
    http.get(uri)
    ttrue(http.status == 200)
    ttrue(http.response.contains("message: Hello World"))
    http.close()
}

uri = HTTP + "/event"
tinfo("Request", "/event", count, "times")
for (let i = 0; i < count; i++) {
    http.get(uri)
    ttrue(http.status == 200)
    ttrue(http.response.contains("done"))
    http.close()
}
