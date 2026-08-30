/*
    header-injection.tst.ts - A CGI must not be able to split the response header block

    A CGI header value is text (RFC 3875 6.3). The handler bounds a value at the next LF, so an LF cannot
    appear inside one, but a bare CR can -- and many clients, caches and proxies treat a lone CR as a line
    terminator. A CGI that reflects request-derived text into a header would then let the requester start a
    header, or a response, of its own. The handler must fail the request rather than forward the value.

    The CGI Status value is checked the same way: a three digit final code, optionally followed by a reason
    phrase, and nothing else.
 */

import {ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

const hdrtest = (query: string) => fetch(`${HTTP}/hdrtest.cgi?${query}`)

//  A CR inside a header value fails the request
let response = await hdrtest('bare-cr')
ttrue(response.status == 502)
ttrue(response.headers.get('X-Test') == null)

//  A redundant trailing CR is trimmed, as it always has been
response = await hdrtest('trailing-cr')
ttrue(response.status == 200)
ttrue(response.headers.get('X-Test') == 'aaa')

/*
    A CRLF ends the header line before the handler ever sees the value, so "X-Test: a\r\nX-Injected: 1" is
    two well formed headers and cannot be told apart from a CGI emitting both deliberately. Pinned here so
    the boundary of what the handler can enforce is explicit.
 */
response = await hdrtest('crlf')
ttrue(response.status == 200)
ttrue(response.headers.get('X-Test') == 'a')
ttrue(response.headers.get('X-Injected') == '1')

//  A well formed CGI still works
response = await hdrtest('ok')
ttrue(response.status == 200)
ttrue(await response.text() == 'SHORT')

//  A bare three digit final code is accepted
for (const code of ['200', '404', '503', '599']) {
    response = await hdrtest(`status=${code}`)
    ttrue(response.status == Number(code))
}

//  A code followed by a reason phrase is accepted (RFC 3875 6.3.3)
response = await hdrtest('status=404+Not+Found')
ttrue(response.status == 404)

//  Anything else fails the request: out of range, not a final status, not three digits, not a number
for (const bad of ['999', '0', '-1', '99', '600', 'abc', '2147483648', '2000', '20', '100', '101', '']) {
    response = await hdrtest(`status=${bad}`)
    ttrue(response.status == 502)
}
