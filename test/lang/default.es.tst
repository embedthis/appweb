/*
    default.tst - Test DefaultLanguage
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/default/index.html")
ttrue(http.status == 200)
ttrue(http.readString().contains("Bonjour"))
http.close()
