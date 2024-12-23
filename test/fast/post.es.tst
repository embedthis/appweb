/*
    post.tst - FAST Post method tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http
load("fast.es")

//  Simple post
http.post(HTTP + "/fast-bin/fastProgram", "Some data")
ttrue(http.status == 200)
match(http, "CONTENT_LENGTH", "9")
http.close()

//  Simple form
http.form(HTTP + "/fast-bin/fastProgram", {name: "John", address: "700 Park Ave"})
ttrue(http.status == 200)
contains(http, "CONTENT_LENGTH")
match(http, "PVAR name", "John")
match(http, "PVAR address", "700 Park Ave")
http.close()
