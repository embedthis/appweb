/*
    post.tst - Post method tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

//  TODO - convert to esp
if (thas('ME_EJS')) {
    http.post(HTTP + "/form.ejs", "Some data")
    ttrue(http.status == 200)
    http.close()

    http.form(HTTP + "/form.ejs", {name: "John", address: "700 Park Ave"})
    ttrue(http.response.contains('"name": "John"'))
    ttrue(http.response.contains('"address": "700 Park Ave"'))
    http.close()

} else {
    tskip("ejs not enabled")
}

//  TODO MORE 
