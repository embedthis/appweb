/*
    form.tst - Post form tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

if (thas('ME_ESP')) {

    //  Empty form
    http.post(HTTP + "/form.esp", "")
    ttrue(http.status == 200)
    http.close()

    //  Simple string
    http.post(HTTP + "/form.esp", "Some data")
    ttrue(http.status == 200)
    http.close()

    //  Two keys
    http.form(HTTP + "/form.esp", {name: "John", address: "700 Park Ave"})
    ttrue(http.response.contains('name=John'))
    ttrue(http.response.contains('address=700 Park Ave'))
    http.close()

} else {
    tskip("ESP not enabled")
}
