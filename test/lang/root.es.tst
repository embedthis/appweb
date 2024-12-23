/*
    root.tst - Test AddLanguageRoot
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

http.setHeader("Accept-Language", "en-US,en;q=0.8")
http.get(HTTP + "/lang/root/eng.html")
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello English"))
http.close()
