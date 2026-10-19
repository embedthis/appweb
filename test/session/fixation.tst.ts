/*
    fixation.tst - Session identifier properties and cookie attributes
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

/*
    Omit Domain to keep the cookie host-only.
 */
ttrue(!/domain=/i.test(r.headers))
