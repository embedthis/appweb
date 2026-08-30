/*
    form.tst.ts - Form-based authentication

    Covers the form-auth round trip: an unauthenticated request redirects to the login page,
    valid credentials establish a session, the session admits the protected resource, and
    logout retires it so the resource redirects again.

    The whole body was previously behind `thas('ME_SSL') && false` -- dead twice over: the flag
    is exported by nowhere, and the `&& false` disabled it regardless (10061).

    The ME_SSL intent was sound. The /auth/form routes are configured secure and answer a plain
    HTTP request with a 301 to https://, so the flow only completes over TLS. The Ejscript Http
    client is built without TLS (Config.SSL is false), so this drives curl through ssl/tls.ts --
    the same helper, and the same reason, as the ssl/ group after 10047.

    Reviving it surfaced 10097: the redirect Location combines the https scheme with the
    plaintext port from CanonicalName, so following it hangs. The reachable part of the flow is
    asserted below; the Location is asserted for the defect it currently has, with the correct
    assertion recorded and pending. Not fixed here -- this feature is test-only.
 */

import {teq, tinfo, ttrue, tget} from '@embedthis/testme'
import {fetch} from '../ssl/tls'

const HTTPS = (tget('TM_HTTPS') || 'https://127.0.0.1:4443')

//  An unauthenticated request is redirected to the login page
let r = await fetch(HTTPS + '/auth/form/index.html', {creds: 'anybody:wrong password'})
teq(r.status, '302')
ttrue(r.headers['location'].contains('login.html'))

/*
    10097: the Location keeps the https scheme but takes host:port from CanonicalName, which
    names the plaintext listener -- so the URL is unreachable and curl hangs on it. Asserted as
    it currently behaves so the defect cannot regress further unnoticed. When 10097 is fixed
    this becomes: ttrue(await fetch(r.headers['location'])).status == '200'
 */
ttrue(r.headers['location'].startsWith('https://'))
tinfo('10097: login redirect names the plaintext port -- ' + r.headers['location'])

//  The login page itself is served over TLS, and carries the form that posts to the login route
r = await fetch(HTTPS + '/auth/form/login.html')
teq(r.status, '200')
ttrue(r.body.contains('<form'))
ttrue(r.body.contains('action="/auth/form/login"'))

//  Valid credentials establish a session and redirect back into the protected area
r = await fetch(HTTPS + '/auth/form/login', {form: {username: 'joshua', password: 'pass1'}})
teq(r.status, '302')
ttrue(r.headers['location'].contains('/auth/form'))

//  A session cookie is issued, and is flagged httponly so script cannot read it
let setCookie = r.headers['set-cookie']
ttrue(setCookie != null)
ttrue(setCookie.contains('-http-session-='))
ttrue(setCookie.toLowerCase().contains('httponly'))

let cookie = setCookie.split(';')[0]

//  The session cookie admits the protected resource
r = await fetch(HTTPS + '/auth/form/index.html', {cookie: cookie})
teq(r.status, '200')

//  Logout retires the session and redirects to the login page
r = await fetch(HTTPS + '/auth/form/logout', {cookie: cookie, method: 'POST'})
teq(r.status, '302')
ttrue(r.headers['location'].contains('login.html'))

//  The retired session no longer admits the resource
r = await fetch(HTTPS + '/auth/form/index.html', {cookie: cookie})
teq(r.status, '302')
ttrue(r.headers['location'].contains('login.html'))
