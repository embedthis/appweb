/*
    lifecycle.tst - Session lifecycle for form authentication

    Covers the states a session moves through: absent, established by login, honoured on a protected
    route, and destroyed by logout. The last one is the assertion that matters most -- a logout that
    leaves the session usable is the defect this exists to catch.

    There was no session test directory at all before this (issue 10041).
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, jar, sessionCookie} from './session'

const HTTPS = tget('TM_HTTPS') || 'https://localhost:4443'
const PROTECTED = HTTPS + '/auth/form/index.html'
const LOGIN = HTTPS + '/auth/form/login'
const LOGOUT = HTTPS + '/auth/form/logout'

const cookies = jar('lifecycle')

//  Without a session the protected route bounces to the login page rather than serving
let r = await req(PROTECTED)
ttrue(r.status == '302')

//  Login establishes a session and sets its cookie
r = await req(LOGIN, {jar: cookies, post: 'username=joshua&password=pass1'})
ttrue(r.status == '302')
ttrue(sessionCookie(r.headers) != '')

//  The session grants access to the protected route
r = await req(PROTECTED, {jar: cookies})
ttrue(r.status == '200')

//  Logout is accepted
r = await req(LOGOUT, {jar: cookies})
ttrue(r.status == '302')

//  ... and the session no longer grants access
r = await req(PROTECTED, {jar: cookies})
ttrue(r.status == '302')

//  Bad credentials do not establish an authenticated session
const badJar = jar('lifecycle-bad')
r = await req(LOGIN, {jar: badJar, post: 'username=joshua&password=wrong'})
r = await req(PROTECTED, {jar: badJar})
ttrue(r.status == '302')
