/*
    dirlist.tst - Directory listings
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

http.get(HTTP + "/listing/")
ttrue(http.status == 200)
http.close()
