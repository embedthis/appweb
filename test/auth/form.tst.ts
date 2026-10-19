/*
    form.tst.ts - Check login, protected access, and logout over TLS using curl.
 */

import {teq, tinfo, ttrue, tget} from '@embedthis/testme'
import {fetch} from '../ssl/tls'

const HTTPS = (tget('TM_HTTPS') || 'https://127.0.0.1:4443')

//  An unauthenticated request is redirected to the login page
let r = await fetch(HTTPS + '/auth/form/index.html', {creds: 'anybody:wrong password'})
teq(r.status, '302')
ttrue(r.headers['location'].contains('login.html'))

let location = r.headers['location']
let target = new URL(location)
if (target.protocol != 'https:' || target.port != new URL(HTTPS).port) {
    tinfo('login redirect is not on the secure endpoint: ' + location)
}
teq(target.protocol, 'https:')
teq(target.port, new URL(HTTPS).port)
teq((await fetch(location)).status, '200')

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
