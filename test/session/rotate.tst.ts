/*
    rotate.tst - The session id must rotate at the Basic/Digest privilege transition

    httpLogin stores the authenticated username in session storage. It must establish a NEW session
    first: a client arriving with a live, server-issued id would otherwise have the victim's identity
    written into the session it chose. That is session fixation, and unlike the form-login path it is
    reachable on every Basic and Digest route.

    Ported from GoAhead test/session/rotate.tst.ts (issue 10060). This is the automated guard for
    issue 10018, whose rotation behaviour was previously verified only by hand.

    The distinction that makes this a real guard rather than a placebo: the id planted here is a
    GENUINE, LIVE, server-issued id obtained pre-auth from the sessionTest action. GoAhead's earlier
    regression test planted a FABRICATED id and passed even against the vulnerable build, because an
    id the server never issued was never going to be adopted in the first place. Do not simplify this
    to a made-up cookie value.
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SESSION_TEST = HTTP + '/action/sessionTest'

/*
    Obtain a real, live, server-issued session id without authenticating. A write to the sessionTest
    action establishes the session and returns its cookie.
 */
async function plantSession(value: string): Promise<string> {
    let r = await req(SESSION_TEST, {post: 'number=' + value})
    ttrue(r.status == '200')
    let cookie = sessionCookie(r.headers)
    ttrue(cookie != '')
    ttrue(cookie.contains('::http.session::'))
    return cookie
}

for (let [scheme, page, value] of [['basic', '/auth/basic/basic.html', '71'],
                                   ['digest', '/auth/digest/digest.html', '72']]) {
    let planted = await plantSession(value)
    let digest = (scheme == 'digest')

    //  The planted session is live: it holds the value written into it
    let r = await req(SESSION_TEST, {cookie: planted, body: true})
    ttrue(r.status == '200')
    ttrue(r.body.contains('Number ' + value))

    //  Authenticate while presenting the planted id. The id must be rotated, not adopted.
    r = await req(HTTP + page, {cookie: planted, user: 'joshua:pass1', digest: digest})
    ttrue(r.status == '200')
    let issued = sessionCookie(r.headers)
    ttrue(issued != '')
    ttrue(issued != planted)
    ttrue(issued.contains('::http.session::'))

    //  The planted id did not inherit the identity - it no longer authenticates
    r = await req(HTTP + page, {cookie: planted})
    ttrue(r.status == '401')

    //  ... and it no longer names a session at all
    r = await req(SESSION_TEST, {cookie: planted, body: true})
    ttrue(r.status == '200')
    ttrue(r.body.contains('Number null'))

    //  The issued id is the authenticated one and reaches the page without credentials
    r = await req(HTTP + page, {cookie: issued})
    ttrue(r.status == '200')
}
