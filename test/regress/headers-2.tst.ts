/*
    Test server resilience against malformed IPv6 URLs with pipelining

    This regression test verifies that the server can handle many requests with
    malformed IPv6 addresses in the URL without crashing. Tests alternate valid
    and invalid requests with HTTP pipelining.
 */

import {tdepth, tget, tskip, ttrue} from '@embedthis/testme'
import {ByteArray, Socket} from '@embedthis/ejscript'
import {send} from '../security/raw'

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
            s.write(`GET / HTTP/1.1\r
    Accept: application/xhtml+xml;v=2.0\r
    Connection: keep-alive\r\n\r\n`)
            await s.read(response, -1)
            //  The valid half of the pair must still be served. Asserted once per 1000
            //  iterations -- the point is that the malformed traffic has not degraded the
            //  server, and an assertion per iteration would dominate the run time.
            if (i % 1000 == 0) {
                ttrue(response.toString().includes('HTTP/1.'))
            }
        } catch (e) {
            s.close()
            s = new Socket
        }

        // Send an invalid request with malformed IPv6 address
        try {
            await s.write(`GET http://[::A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:A:A]:8080/ HTTP/1.1\r
Host: 7.7.7.8:8080\r
User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537. 36\r
Accept: text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5\r
Accept-Language: en-us,en;q=0.5\r
Accept-Encoding: gzip,deflate\r
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7\r
Keep-Alive: 300\r
Connection: keep-alive\r\n\r\n`)
            await s.read(response, -1)
        } catch (e) {
            s.close()
            s = new Socket
        }
    }

    /*
        The server survived the soak and still answers. Without this the test could only ever
        detect a crash, and a server left wedged or refusing connections passed silently (10063).

        Driven through the raw helper rather than the loop's own socket: after thousands of
        connect/close cycles the shim's socket state is not reliably reusable.
     */
    s.close()
    let final = await send(`GET /index.html HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`,
        'HTTP/1.', true)

    /*
        Liveness, not status. appweb.conf arms Monitor "NotFoundErrors > 190" 5sec deny, and a
        soak of this size trips it -- the runner's own address is banned and answered 406 for the
        remainder of the window. That is the configured behaviour, so asserting 200 here would be
        asserting that the defence did not fire. What must hold is that the server is still alive
        and still framing responses.
     */
    ttrue(final.text.includes('HTTP/1.'))

} else {
    tskip('Skip test -- Runs at depth 6')
}
