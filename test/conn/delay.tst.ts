/*
    Test various protocol delays

    Tests server handling of delayed HTTP requests where parts of the request
    arrive with delays. Validates that the server can handle slow clients that
    send requests in fragments with delays between writes.
 */

import {ttrue, tget} from 'testme'
import {App, ByteArray, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")
const DELAY  = 500

let s
let count = 0
let response = new ByteArray

// Test delay in the middle of request line
s = new Socket
s.connect(HTTP.address)
App.sleep(DELAY)

// Send request with delay partway through first line
count += await s.write("GET")
ttrue(count == 3)
App.sleep(DELAY)
count += await s.write(" /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 10)
let n
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

// Test delay before headers
response.reset()
s = new Socket
s.connect(HTTP.address)
count = await s.write("GET")
ttrue(count == 3)
App.sleep(DELAY)
count += await s.write(" /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 10)
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

// Test delay after first CRLF
response.reset()
s = new Socket
s.connect(HTTP.address)
count = await s.write("GET")
ttrue(count == 3)
count += await s.write(" /index.html HTTP/1.0\r\n")
App.sleep(DELAY)
count += await s.write("\r\n")
ttrue(count > 10)
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()
