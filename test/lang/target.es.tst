/*
    target.tst - Test AddLanguage
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.setHeader("Accept-Language", "en")
http.get(HTTP + "/lang/target/index.html")
ttrue(http.status == 200)
ttrue(http.readString().contains("English Suffix"))
http.close()
