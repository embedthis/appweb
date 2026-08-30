/*
    fixation.tst - Session identifier properties and cookie attributes

    Two things are asserted here:

    - a session identifier the server did not issue is not honoured, so an attacker cannot fix a
      victim's session to a value they know;
    - the identifier's random field is unpredictable. It is now drawn from the cryptographic random
      source; before this release it was an MD5 over a heap pointer, the tick count and a counter,
      which on a target without ASLR repeated across boots.

    The cookie's HttpOnly attribute is checked here too -- it is what keeps the identifier out of
    reach of script, and it is a one-word regression away from being dropped.

    There was no session test directory at all before this (issue 10041).
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, jar, sessionCookie, randomPart, COOKIE} from './session'

const HTTPS = tget('TM_HTTPS') || 'https://localhost:4443'
const PROTECTED = HTTPS + '/auth/form/index.html'
const LOGIN = HTTPS + '/auth/form/login'

//  An identifier the server never issued grants nothing
let r = await req(PROTECTED,
    {cookie: COOKIE + '=9::http.session::deadbeefdeadbeefdeadbeefdeadbeef'})
ttrue(r.status == '302')

//  A well-formed but unissued identifier is likewise not honoured
r = await req(PROTECTED, {cookie: COOKIE + '=1::http.session::' + 'a'.repeat(32)})
ttrue(r.status == '302')

/*
    Collect identifiers from several independent logins. Each is a fresh session, so the random
    field must differ every time and must be a full-width hex digest.
 */
const seen = new Set<string>()
for (let i = 0; i < 5; i++) {
    r = await req(LOGIN, {jar: jar('fixation-' + i), post: 'username=joshua&password=pass1'})
    const cookie = sessionCookie(r.headers)
    ttrue(cookie != '')

    const random = randomPart(cookie)
    ttrue(/^[0-9a-f]{32}$/.test(random))
    seen.add(random)
}
ttrue(seen.size == 5)

//  The cookie is not reachable from script
r = await req(LOGIN, {jar: jar('fixation-attrs'), post: 'username=joshua&password=pass1'})
ttrue(/httponly/i.test(r.headers))
