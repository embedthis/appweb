/*
    get.tst - Http GET tests

    Tests basic HTTP GET functionality including response validation, content reading,
    and platform-specific behaviors like case-insensitive file access on Windows.
 */

import {tcontains, ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Test basic GET request and validate response code
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

// Test reading response content in chunks
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.readString(12) == "<html><head>")
ttrue(http.readString(7) == "<title>")

// Test validating response ends with expected content
http.get(HTTP + "/index.html")
await http.finalize()
tcontains(http.response, "</html>")

// Test GET with a body (valid HTTP, though unusual)
http.get(HTTP + "/index.html", 'name=John&address=700+Park+Ave')
await http.finalize()
ttrue(http.status == 200)
http.close()

// Test case-insensitive file access on Windows
if (Config.OS == 'windows') {
    http.get(HTTP + "/inDEX.htML")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()
}
