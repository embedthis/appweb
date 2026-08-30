/*
    cached-auth.tst - A session established under one auth scheme must not satisfy another

    httpAuthenticate short-circuits on a session that already names a user: it reads
    HTTP_SESSION_USERNAME and authenticates the request without consulting the route's AuthType. A
    session minted on a Basic route therefore reaches a Digest route, and vice versa, because the
    cached read never asks which scheme the route actually requires.

    Ported from GoAhead test/session/cached-auth.tst.ts (issue 10060). The cross-scheme assertions
    are the automated guard for issue 10019.

    The first half - that the cookie alone authenticates a later request to the SAME route - is
    correct and intended behaviour, and is asserted so a fix for 10019 cannot regress it by disabling
    session caching outright.
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
    The cross-scheme assertions (issue 10019).

    A session minted on the Basic route must not by itself satisfy a route configured for Digest.
    The route asked for a specific authentication scheme; a cached username is not evidence that the
    client ever satisfied it. These are expected to FAIL until 10019 is fixed - see the note at the
    end of this file.
 */
r = await req(DIGEST, {cookie: basicCookie})
ttrue(r.status == '401')

r = await req(BASIC, {cookie: digestCookie})
ttrue(r.status == '401')
