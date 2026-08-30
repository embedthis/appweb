/*
    bad-path.tst.ts - Malformed request target

    A request line carrying a non-HTTP URI scheme, a non-HTTP version, or no target at all must
    not be routed. This shape reaches Appweb from SIP scanners probing for a proxy.

    The test previously wrote the request, read the response into a ByteArray and discarded it,
    so the only regression it could detect was a crash -- a wrong status, a routed request, or a
    second response on the connection all passed silently (10063).

    The three cases below are refused three different ways. That is asserted as it stands rather
    than normalised, because the property that matters is that none of them reaches a handler,
    and pinning the current shape is what makes a change to it visible.
 */

import {teq, ttrue} from '@embedthis/testme'
import {responses, send} from '../security/raw'

/*
    A SIP request line: neither the target nor the version is HTTP. The server emits nothing at
    all and closes -- it does not even reach the point of formatting an error response.
 */
let reply = await send('OPTIONS sip:nm SIP/2.0\r\nContent-Length: 0\r\nAccept: application/*\r\n\r\n',
    'HTTP/1.', true)
teq(reply.text, '')
ttrue(reply.closed)

/*
    An absolute target in a foreign scheme. Absolute-form is for proxies; this server is not one
    for gopher, so nothing is served. It answers 404 rather than 400 -- lenient against RFC 9112
    5.3.2, but it resolves to no document, which is the property under test.
 */
reply = await send('GET gopher://example.com/x HTTP/1.1\r\nHost: localhost\r\n\r\n', 'HTTP/1.')
ttrue(reply.text.includes('404 Not Found'))
teq(responses(reply.text), 1)

//  A request line with no target at all is a grammar violation and is refused outright
reply = await send('GET  HTTP/1.1\r\nHost: localhost\r\n\r\n', 'HTTP/1.', true)
ttrue(reply.text.includes('400 Bad Request'))
teq(responses(reply.text), 1)
ttrue(reply.closed)
