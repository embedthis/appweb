/*
    header.tst - Http response header tests

    Tests HTTP response headers including Connection, Content-Type, Date, Last-Modified,
    and validates the ability to set custom request headers.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const URL = HTTP + "/index.html"
let http: Http = new Http

// Test Connection header for Keep-Alive
http.get(HTTP + "/index.html")
await http.finalize()
let connection = http.header("Connection")
ttrue(connection == "Keep-Alive")

// Test standard response headers
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.statusMessage == "OK")
ttrue(http.contentType.indexOf("text/html") == 0)
ttrue(http.date != "")
ttrue(http.lastModified != "")

// Test headers with POST method
http.post(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

// Test setting custom request headers
http.reset()
http.setHeader("key", "value")
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

http.close()
