/*
    chunk.tst - Test chunked transfer encoding for response data

    TODO - incomplete
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.post(HTTP + "/index.html")
http.wait()
ttrue(http.status == 200)
http.close()

//  TODO - more here. Test various chunk sizes.
//  TODO - want to be able to set the chunk size?
