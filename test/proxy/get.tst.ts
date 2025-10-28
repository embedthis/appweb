/*
    Test proxy handling of HTTP GET requests

    This test verifies that the proxy correctly forwards GET requests and returns
    responses, including:
    - Basic GET with status and content validation
    - Partial response reading
    - GET with body (unusual but valid HTTP)
    - Case-insensitive file matching on Windows
 */

import {ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

// Basic GET through proxy with response validation
http.get(HTTP + "/index.html")

await http.finalize()
ttrue(http.status == 200)
ttrue(http.readString().contains("Hello"))
http.reset()

// Test partial response reading
http.get(HTTP + "/index.html")

await http.finalize()
ttrue(http.readString(12) == "<html><head>")
ttrue(http.readString(7) == "<title>")
http.reset()

// Test response end validation
http.get(HTTP + "/index.html")

await http.finalize()
ttrue(http.response.endsWith("</html>\n"))
http.reset()

// Test GET with body (unusual but valid HTTP)
http.get(HTTP + "/index.html", 'name=John&address=700+Park+Ave')

await http.finalize()
ttrue(http.status == 200)
http.close()

// Test case-insensitive file matching on Windows
if (Config.OS == 'windows') {
    http.get(HTTP + "/inDEX.htML")

    await http.finalize()
    ttrue(http.status == 200)
    http.close()
}
