/*
    errordoc.tst - Test Error Documents
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http


//  Standard error messages
http.get(HTTP + "/wont-be-there.html")
ttrue(http.status == 404)
ttrue(http.response.contains("Access Error: 404 -- Not Found"))
http.close()

//  This uses an error document
http.get(HTTP + "/error/also-wont-be-there.html")
ttrue(http.status == 404)
ttrue(http.response.contains("<body>Bad luck - Can't find that document</body>"))
http.close()

//  Try again to make sure that pipelining still works
http.get(HTTP + "/error/also-wont-be-there.html?2")
ttrue(http.status == 404)
ttrue(http.response.contains("<body>Bad luck - Can't find that document</body>"))
http.close()
