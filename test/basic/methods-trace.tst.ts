/*
    methods-trace.tst.ts - TRACE

    basic/methods.tst.ts asserts the server advertises "Allow: GET,OPTIONS,POST,TRACE", and no
    test ever exercised TRACE itself (10064). The suite asserted the method was offered and never
    checked what it did -- and TRACE is the cross-site-tracing surface, so what it reflects is
    the whole question.

    What it reflects turns out not to be the request. 10116: handleTraceMethod() in
    http/src/passHandler.c synthesizes the response headers and sends those as the body, so TRACE
    cannot serve its purpose. That is asserted below as it stands.

    The security property is asserted separately and on purpose: because the request is never
    reflected, no Authorization header or Cookie can come back to the caller, so classic XST is
    absent here. It is absent as a side effect of 10116, not by design -- which is exactly why it
    needs a test. Anyone making TRACE conformant must keep this property or introduce the
    vulnerability while fixing the bug.

    Driven over a raw socket: TRACE is about exact request bytes, so the test must control them.
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {HOST, send} from '../security/raw'

const CLOSE = 'Host: ' + HOST + '\r\nConnection: close\r\n\r\n'

//  TRACE is answered on the route configured for it, with the required content type
let reply = await send('TRACE /trace/index.html HTTP/1.1\r\nX-Probe: probe-value\r\n' + CLOSE,
    'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))
ttrue(reply.text.includes('message/http'))

/*
    10116: the reflected message is a synthesized response, not the request. Pinned as-is --
    when 10116 is fixed these two become:
        ttrue(reply.text.includes('TRACE /trace/index.html'))
        ttrue(reply.text.includes('X-Probe: probe-value'))
 */
ttrue(!reply.text.includes('TRACE /trace/index.html HTTP/1.1\r\nX-Probe'))
ttrue(!reply.text.includes('X-Probe: probe-value\r\nHost'))
tinfo('10116: TRACE reflects response headers, not the received request')

/*
    The XST property, which must hold whatever 10116 does. A TRACE carrying credentials and
    session state must not hand either back to the requester.
 */
reply = await send('TRACE /trace/index.html HTTP/1.1\r\n' +
    'Authorization: Basic am9zaHVhOnBhc3Mx\r\n' +
    'Cookie: -http-session-=must-not-be-echoed\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))
ttrue(!reply.text.includes('am9zaHVhOnBhc3Mx'))
ttrue(!reply.text.includes('must-not-be-echoed'))

//  TRACE is refused where the route does not permit it
reply = await send('TRACE /index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(!reply.text.includes('200 OK'))

//  OPTIONS advertises exactly the methods the route permits, and TRACE is among them
reply = await send('OPTIONS /trace/index.html HTTP/1.1\r\n' + CLOSE, 'HTTP/1.', true)
ttrue(reply.text.includes('200 OK'))

let allow = ''
for (let line of reply.text.split('\r\n')) {
    if (line.toLowerCase().startsWith('allow:')) {
        allow = line.slice(6).trim()
    }
}
teq(allow.split(',').map((s: string) => s.trim()).sort().join(','), 'GET,OPTIONS,POST,TRACE')
