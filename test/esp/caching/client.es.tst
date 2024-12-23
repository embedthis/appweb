/*
    client.tst - Test client caching
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/cache/client")
ttrue(http.status == 200)
ttrue(http.header("Cache-Control") == "public, max-age=3600")

http.close()


