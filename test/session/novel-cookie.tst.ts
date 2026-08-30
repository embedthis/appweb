/*
    novel-cookie.tst - An unknown session id must not be adopted, and must not cost a session slot

    A read never allocates, so an arbitrary client cannot mint server state simply by presenting a
    novel cookie. A write does allocate, but always mints a fresh server-generated id rather than
    adopting the client's value - the session fixation invariant.

    Ported from GoAhead test/session/novel-cookie.tst.ts (issue 10060).
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SESSION_TEST = HTTP + '/action/sessionTest'

//  A well-formed but never-issued id
const FAKE = '-http-session-=9::http.session::ffffffffffffffffffffffffffffffff'

//  Read with an unknown id: not adopted, and no session is minted for it
let r = await req(SESSION_TEST, {cookie: FAKE, body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number null'))
ttrue(sessionCookie(r.headers) == '')

//  A read with no cookie at all likewise allocates nothing
r = await req(SESSION_TEST, {body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number null'))
ttrue(sessionCookie(r.headers) == '')

//  A write while presenting an unknown id mints a FRESH id rather than adopting the client's
r = await req(SESSION_TEST, {cookie: FAKE, post: 'number=42'})
ttrue(r.status == '200')
let issued = sessionCookie(r.headers)
ttrue(issued != '')
ttrue(issued != FAKE)
ttrue(!issued.contains('ffffffffffffffffffffffffffffffff'))

//  The value landed in the issued session, not in the client's
r = await req(SESSION_TEST, {cookie: issued, body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 42'))

//  ... and the unknown id still names nothing
r = await req(SESSION_TEST, {cookie: FAKE, body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number null'))
