/*
    badUrl.tst.ts - Stress test malformed URL handling
    Verifies that server rejects URLs with invalid characters
 */

import {tcontains, tget, ttrue} from 'testme'
import {ByteArray, Http, Socket} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const PORT = tget('TM_HTTP_PORT', 4100)
let http: Http = new Http

//  Test that Http client rejects malformed URL
let caught
try {
    http.get(HTTP + '/index\x01.html')
    await http.finalize()
} catch {
    caught = true
}
ttrue(caught)
http.close()

//  Test server response to malformed URL sent via raw socket
let s = new Socket
s.connect(PORT)
s.write('GET /index\x01.html HTTP/1.0\r\n\r\n')
let response = new ByteArray
while ((n = s.read(response, -1)) != null) {}
let r = response.toString()
tcontains(r, 'Bad Request')
s.close()
