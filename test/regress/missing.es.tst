/*
    empty-form.tst - Test an missing form
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

http.post(HTTP + "/expect-missing", "")
ttrue(http.status == 404)
http.close()
