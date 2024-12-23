/*
    methods.tst - Test misc Http methods
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Test methods are caseless
http.connect("GeT", HTTP + "/index.html")
ttrue(http.status == 200)

//  Put a file
data = Path("test.dat").readString()
http.put(HTTP + "/tmp/test.dat", data)
ttrue(http.status == 201 || http.status == 204)

//  Delete
http.connect("DELETE", HTTP + "/tmp/test.dat")
if (http.status != 204) {
    print("STATUS IS " + http.status)
}
ttrue(http.status == 204)

//  Post
http.post(HTTP + "/index.html", "Some data")
ttrue(http.status == 200)

//  Options
http.connect("OPTIONS", HTTP + "/trace/index.html")
ttrue(http.header("Allow").split(',').sort() == "GET,OPTIONS,POST,TRACE")

http.connect("OPTIONS", HTTP + "/tmp/index.html")
ttrue(http.header("Allow").split(',').sort() == "DELETE,GET,OPTIONS,POST,PUT")

//  Trace - should be disabled by default
http.reset()
http.connect("TRACE", HTTP + "/index.html")
ttrue(http.status == 404)
http.connect("TRACE", HTTP + "/trace/index.html")
ttrue(http.status == 200)
ttrue(http.contentType.indexOf('message/http') == 0)
ttrue(http.response.contains('HTTP/1.1 200 OK'))
ttrue(http.response.contains('Date'))
ttrue(http.response.contains('Content-Type: text/html'))
ttrue(!http.response.contains('Content-Length'))

/*
//  Head
http.connect("HEAD", HTTP + "/index.html")
ttrue(http.status == 200)
ttrue(http.header("Content-Length") > 0)
ttrue(http.response == "")
http.close()
*/
