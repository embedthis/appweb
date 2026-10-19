/*
    vars.tst - Session variable lifecycle via the sessionTest action
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SESSION_TEST = HTTP + '/action/sessionTest'

//  Read first, with no cookie. No session, no value, and critically no Set-Cookie.
let r = await req(SESSION_TEST, {body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number null'))
ttrue(sessionCookie(r.headers) == '')

//  A write establishes the session and returns its id
r = await req(SESSION_TEST, {post: 'number=7'})
ttrue(r.status == '200')
const cookie = sessionCookie(r.headers)
ttrue(cookie != '')
ttrue(cookie.contains('::http.session::'))

//  The value round-trips
r = await req(SESSION_TEST, {cookie: cookie, body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 7'))

//  A second write to the same session updates in place and does not mint a new id
r = await req(SESSION_TEST, {cookie: cookie, post: 'number=8'})
ttrue(r.status == '200')
r = await req(SESSION_TEST, {cookie: cookie, body: true})
ttrue(r.body.contains('Number 8'))

//  A different session is isolated from it
r = await req(SESSION_TEST, {post: 'number=9'})
const other = sessionCookie(r.headers)
ttrue(other != cookie)
r = await req(SESSION_TEST, {cookie: cookie, body: true})
ttrue(r.body.contains('Number 8'))
r = await req(SESSION_TEST, {cookie: other, body: true})
ttrue(r.body.contains('Number 9'))
