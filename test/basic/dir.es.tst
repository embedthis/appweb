/*
    dir.tst - Directory GET tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

/*  TODO DIRECTORY LISTINGS NEEDED 
http.get(HTTP + "/dir/")
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
http.get(HTTP + "/index.html", {name: "John", address: "700 Park Ave"})
ttrue(http.status == 200)
http.close()
*/
