/*
    gzip.tst - Compressed content
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Accept a gzip encoding if present
http.setHeader("Accept-Encoding", "gzip")
http.get(HTTP + "/compress/compressed.txt")
ttrue(http.status == 200)
http.close()
