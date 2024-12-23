/*
    limits.tst - Test caching limits
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// let level = App.log.level
// http.trace({ level: 3, rxHeaders: 0, rxBody: 0, txHeaders: 0, size: 999999})

//  Get a document that will normally require chunking
http.get(HTTP + "/cache/huge")
ttrue(http.status == 200)
ttrue(http.header("Transfer-Encoding") == "chunked")
ttrue(!http.header("Content-Length"))
ttrue(http.response.contains("Line: 09999 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))
http.close()

//  Because of the LimitCacheItem, huge won't be cached,
http = new Http
http.get(HTTP + "/cache/huge")
ttrue(http.status == 200)
ttrue(http.header("Transfer-Encoding") == "chunked")
ttrue(!http.header("Content-Length"))
ttrue(http.response.contains("Line: 09999 aaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbccccccccccccccccccddddddd<br/>"))
http.close()

// http.trace({ level: level })
