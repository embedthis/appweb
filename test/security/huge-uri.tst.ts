/*
    Test server handling of excessively large URIs

    This test verifies that the server properly rejects URIs that exceed
    the configured LimitUri setting (typically < 100K). The test creates
    a ~100K URI and verifies the server returns 400 Bad Request or
    413 Request Entity Too Large, then confirms the server is still operational.
 */

import {tfail, tget, ttrue} from 'testme'
import {App, ByteArray, Http, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

// Create a ~100K URI that should exceed LimitUri
let data = "/"
for (let i in 1000) {
    data += "012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678\n"
}

// Test LimitUri enforcement
let s = new Socket
s.connect(HTTP.address)
let count = 0
try {
    count += await s.write("GET ")
    count += await s.write(data)
    count += await s.write(" HTTP/1.1\r\nHost: " + HTTP.host + "\r\n\r\n")
} catch {
    tfail("Write failed. Wrote  " + count + " of " + data.length + " bytes.")
}

let response = new ByteArray
try {
    let n: number | null
    while ((n = await s.read(response, -1)) != null) {}
} catch {
    // Server may close connection after error response
}
let responseText = response.toString()

// Server returns 400 Bad Request for malformed URI or 413 for too large
ttrue(responseText.contains('400 Bad Request') || responseText.contains('413 Request Entity Too Large'))
s.close()

// Check server still operational after attack
App.sleep(2000)
let http = new Http
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)
http.close()
