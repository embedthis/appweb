/*
    rotate.tst - The session id must rotate at the Basic/Digest privilege transition
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
