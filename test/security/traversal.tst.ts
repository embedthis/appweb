/*
    Test protection against directory traversal attacks

    This test verifies that the server properly prevents directory traversal
    attempts using various techniques:
    - Parent directory references (../)
    - Windows backslash delimiters (\)
    - URL-encoded backslashes (%5C)
    - Deep traversal chains
 */

import {ttrue, tget} from 'testme'
import {Http, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

let http = new Http

// Test traversal to configuration file
http.get(HTTP + "/../../appweb.conf")
await http.finalize()
// Server blocks traversal with either 400 (Bad Request) or 404 (Not Found)
ttrue(http.status == 400 || http.status == 404)

// Test traversal to existing file
http.reset()
http.get(HTTP + "/../../index.html")
await http.finalize()
// Path normalization may resolve this to /index.html which exists (200)
// or block it with 400/404 - both are acceptable
ttrue(http.status == 200 || http.status == 400 || http.status == 404)

// Test Windows backslash delimiter
http.reset()
http.get(HTTP + "/..%5Cappweb.conf")
await http.finalize()
ttrue(http.status == 400 || http.status == 404)

// Test deep traversal chain
http.reset()
http.get(HTTP + "/../../../../../.x/.x/.x/.x/.x/.x/etc/passwd")
await http.finalize()
ttrue(http.status == 400 || http.status == 404)
http.close()

