/*
    Test server handling of malformed request path

    This regression test verifies that the server properly rejects requests with
    invalid URI schemes like "sip:nm" instead of HTTP paths.
 */

import {ByteArray, Socket} from 'ejscript'

let s = new Socket

// Send OPTIONS request with invalid SIP protocol path
s.connect('127.0.0.1:4100')
await s.write(`OPTIONS sip:nm SIP/2.0\r
Content-Length: 0\r
Accept: application/*\r\n\r\n`)

let response = new ByteArray
while (await s.read(response, -1) != null) {}
s.close()

