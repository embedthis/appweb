/*
    timeout.tst - Put timeout tests
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

//  Do a simple get to ensure the server is alive because the request below does not provide feedback
http.get(HTTP + "/index.html")
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello"))
http.close()

//  WARNING: This request should hang because we don't write any data and finalize. Wait with a timeout.
http.setHeader("Content-Length", 1000)
http.put(HTTP + "/tmp/test.dat?r2")
ttrue(http.wait(250) == false)
http.close()
