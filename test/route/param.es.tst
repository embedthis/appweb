/*
    param.tst - Test match by param
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Should fail
http.get(HTTP + "/route/param?name=ralph")
ttrue(http.status == 404)
http.close()

http.get(HTTP + "/route/param?name=peter")
ttrue(http.status == 200)
ttrue(http.response == "peter")
http.close()

//  Should fail
http.form(HTTP + "/route/param", {name: "ralph"})
ttrue(http.status == 404)
http.close()

http.form(HTTP + "/route/param", {name: "peter"})
ttrue(http.status == 200)
ttrue(http.response == "peter")
http.close()
