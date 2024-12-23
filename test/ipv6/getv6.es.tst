/*
    getv6.tst - IPv6 GET tests
 */

const HTTP = tget('TM_HTTPV6') || "[::1]:4110"
let http: Http = new Http

//  Basic get. Validate response code and contents
http.get(HTTP + "/index.html")
ttrue(http.status == 200)
// ttrue(http.readString().contains("Hello"))

//  Validate get contents
http.get(HTTP + "/index.html")
ttrue(http.readString(12) == "<html><head>")
ttrue(http.readString(7) == "<title>")

//  Validate get contents
http.get(HTTP + "/index.html")
ttrue(http.response.endsWith("</html>\n"))
ttrue(http.response.endsWith("</html>\n"))

//  Test Get with a body. Yes this is valid Http, although unusual.
http.get(HTTP + "/index.html", 'name=John&address=700+Park+Ave')
ttrue(http.status == 200)
http.close()
