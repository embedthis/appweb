/*
    chunk.tst - Test chunked transfer encoding for response data
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

http.post(HTTP + "/index.html")
http.wait()
ttrue(http.readString().contains("Hello"))
ttrue(http.status == 200)
http.close()
