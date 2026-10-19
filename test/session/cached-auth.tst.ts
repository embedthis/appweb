/*
    cached-auth.tst - A session established under one auth scheme must not satisfy another
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const BASIC = HTTP + '/auth/basic/basic.html'
const DIGEST = HTTP + '/auth/digest/digest.html'

//  A well-formed but never-issued id, to prove an unknown session grants nothing
const FAKE = '-http-session-=9::http.session::ffffffffffffffffffffffffffffffff'

//  Basic: authenticate once and keep the session cookie
let r = await req(BASIC, {user: 'joshua:pass1'})
ttrue(r.status == '200')
const basicCookie = sessionCookie(r.headers)
ttrue(basicCookie != '')

//  The cookie alone authenticates the next request to the same route - the cached read resolves it
r = await req(BASIC, {cookie: basicCookie})
ttrue(r.status == '200')

//  Negative control: no cookie and no credentials
r = await req(BASIC)
ttrue(r.status == '401')

//  Negative control: an unknown session id grants nothing
r = await req(BASIC, {cookie: FAKE})
ttrue(r.status == '401')

//  Digest: same round trip
r = await req(DIGEST, {user: 'joshua:pass1', digest: true})
ttrue(r.status == '200')
const digestCookie = sessionCookie(r.headers)
ttrue(digestCookie != '')

r = await req(DIGEST, {cookie: digestCookie})
ttrue(r.status == '200')

r = await req(DIGEST)
ttrue(r.status == '401')

/*
    A Basic session must not satisfy a Digest route without Digest credentials.
 */
r = await req(DIGEST, {cookie: basicCookie})
ttrue(r.status == '401')

r = await req(BASIC, {cookie: digestCookie})
ttrue(r.status == '401')
