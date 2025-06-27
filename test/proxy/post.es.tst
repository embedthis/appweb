/*
    post.tst - Post method tests
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'

let http: Http = new Http

if (thas('ME_ESP')) {
    //  Fix for streaming
    http.form(HTTP + "/form.esp", {data: "Some data"})
    ttrue(http.status == 200)
    http.close()

    http.form(HTTP + "/form.esp", {name: "John", address: "700 Park Ave"})
    ttrue(http.status == 200)
    ttrue(http.response.contains('FORM name=John'))
    ttrue(http.response.contains('FORM address=700 Park Ave'))
    http.close()
}
