/*
    bigForm.tst - Stress test very large form data (triggers chunking)
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

/*
//  This should be about 20K. LimitRequestForm is configured for 32K
let form = {}
for (i in 1000) {
    form["field_" + i] = Date.ticks
}
// print('size', serialize(form).length)
http.form(HTTP + "/test.esp", form)
ttrue(http.status == 200)
ttrue(http.response.contains("ESP Test Program"))
http.close()
*/


//  This should be about 50K. LimitRequestForm is configured for 32K
let form = {}
for (i in 2200) {
    form["field_" + i] = Date.ticks
}
http.form(HTTP + "/test.esp", form)
ttrue(http.status == 413)
ttrue(http.response.contains("Request Entity Too Large"))
http.close()
