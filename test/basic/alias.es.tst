/*
    alias.tst - Alias http tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

http.get(HTTP + "/aliasDir/atest.html")
ttrue(http.status == 200)
ttrue(http.response.contains("alias/atest.html"))

http.get(HTTP + "/aliasFile/")
ttrue(http.status == 200)
ttrue(http.response.contains("alias/atest.html"))

http.get(HTTP + "/AliasDocs/index.html")
ttrue(http.status == 200)
ttrue(http.response.contains("My Documents/index.html"))
http.close()
