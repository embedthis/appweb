/*
    Test server handling of HTTP CONNECT method

    This test verifies that the server properly rejects CONNECT requests
    (typically used for proxying) with a 400 Bad Request response.
 */

import {ttrue, tget, tcontains} from 'testme'
import {ByteArray, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

let s = new Socket
let response = new ByteArray
s.connect(HTTP.address)

// Send CONNECT request (proxy tunneling)
let request =  "CONNECT 10.129.252.79:9993 HTTP/1.1\r\n\r\n"
await s.write(request)
let n
while ((n = await s.read(response, -1)) != null) {
    if (response.toString().contains("</html")) break
}

// Server should reject with 400 Bad Request
tcontains(response.toString(), 'HTTP/1.1 400 Bad Request')
s.close()
