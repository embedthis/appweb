/*
    getv6.tst - IPv6 GET tests

    Tests HTTP GET functionality over IPv6. Similar to basic GET tests but uses
    IPv6 addressing ([::1] for localhost) to validate IPv6 support in the server.
 */

import {tcontains, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTPV6') || "[::1]:4110"
let http: Http = new Http

// Test basic GET over IPv6 and validate response code
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

// Test reading response content in chunks over IPv6
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.readString(12) == "<html><head>")
ttrue(http.readString(7) == "<title>")

// Test validating response ends with expected content over IPv6
http.get(HTTP + "/index.html")
await http.finalize()
tcontains(http.response, "</html>")

// Test GET with body over IPv6
http.get(HTTP + "/index.html", 'name=John&address=700+Park+Ave')
await http.finalize()
ttrue(http.status == 200)

http.close()
