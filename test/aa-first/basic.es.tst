/*
    basic.tst - Test basic connectivity
 */

// const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const HTTP = tget('TM_HTTP')
let http: Http = new Http

/*
    If this fails. Look at trace.txt log output.
 */
http.get(HTTP + '/index.html')
ttrue(http.status == 200)
http.close()
