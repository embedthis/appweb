/*
    get.tst - Http GET tests
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

//  Basic get. Validate response code and contents
http.get(HTTP + "/index.html")
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello"))
http.reset()

//  Validate get contents
http.get(HTTP + "/index.html")
ttrue(http.readString(12) == "<html><head>")
ttrue(http.readString(7) == "<title>")
http.reset()

//  Validate get contents
http.get(HTTP + "/index.html")
ttrue(http.response.endsWith("</html>\n"))
http.reset()

//  Test Get with a body. Yes this is valid Http, although unusual.
http.get(HTTP + "/index.html", 'name=John&address=700+Park+Ave')
ttrue(http.status == 200)
http.close()

if (Config.OS == 'windows') {
    http.get(HTTP + "/inDEX.htML")
    ttrue(http.status == 200)
    http.close()
}
