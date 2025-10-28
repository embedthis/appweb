/*
    Test server resilience against malformed headers with pipelining

    This regression test verifies that the server can handle many requests with
    malformed headers and control characters without crashing. Tests alternate
    valid and invalid requests with HTTP pipelining.
 */

import {tdepth, tget, tskip} from 'testme'
import {ByteArray, Socket} from 'ejscript'

if (tdepth() >= 6) {

    let IP = tget('TM_HTTP') || "127.0.0.1:4100"
    let ip = IP.replace('http://', '')

    let response = new ByteArray
    let iterations = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

    let count = iterations[tdepth()] * 1000
    let s = new Socket

    for (let i = 0; i < count; i++) {
        // Send a valid request
        try {
            s.connect(ip)
            await s.write(`GET / HTTP/1.1\r
Accept: application/xhtml+xml;v=2.0\r
Connection: keep-alive\r\n\r\n`)
            await s.read(response, -1)
        } catch (e) {
            s.close()
            s = new Socket
        }

        // Send an invalid request with malformed headers and control characters
        try {
            await s.write(`GET / HTTP/1.1\r
Accept: application/xhtml+xml;v=2.0\r
Connection: keep-alive\r
Cache-Control: no-cache\r
If-Modified-^[!@^@:0 Jan 0000 00:00 +0000\r
Content-Disposition^[[41m^[[2J^[[33^[[u^[[s^[[Kinline\r\n\r\n`)
            await s.read(response, -1)
        } catch (e) {
            s.close()
            s = new Socket
        }
    }
} else {
    tskip('Skip test -- Runs at depth 6')
}
