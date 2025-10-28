/*
    Test HTTP request handling with various whitespace variations

    This test verifies that the server correctly handles HTTP requests with:
    - Leading whitespace before the method
    - Multiple spaces after the method
    - Multiple spaces after the URI
 */

import {ttrue, tget} from 'testme'
import {ByteArray, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

let s
let count = 0
let n

// Test leading whitespace before method
s = new Socket
s.connect(HTTP.address)
count += await s.write(" GET /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 0)
let response = new ByteArray
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

// Test multiple spaces after method
s = new Socket
s.connect(HTTP.address)
count += await s.write("GET         /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 0)
response = new ByteArray
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

// Test multiple spaces after URI
s = new Socket
s.connect(HTTP.address)
count += await s.write("GET /index.html      HTTP/1.0\r\n\r\n")
ttrue(count > 0)
response = new ByteArray
for (count = 0; (n = await s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

