/*
    errordoc.tst - Test Error Documents

    Tests custom error document handling. Verifies that the server can use custom
    HTML pages for error responses in certain directories while using default error
    messages in others. Also validates that error document handling works correctly
    with HTTP pipelining.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test standard error message (no custom error document)
http.get(HTTP + "/wont-be-there.html")
await http.finalize()
ttrue(http.status == 404)
ttrue(http.response.contains("Access Error: 404 -- Not Found"))
http.close()

// Test custom error document for /error directory
http.get(HTTP + "/error/also-wont-be-there.html")
await http.finalize()
ttrue(http.status == 404)
ttrue(http.response.contains("<body>Bad luck - Can't find that document</body>"))
http.close()

// Test error document with pipelining (second request)
http.get(HTTP + "/error/also-wont-be-there.html?2")
await http.finalize()
ttrue(http.status == 404)
ttrue(http.response.contains("<body>Bad luck - Can't find that document</body>"))
http.close()
