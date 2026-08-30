/*
    xsrf.tst - Route XSRF enforcement

    A route configured with XSRF must mint a token on safe requests and reject state-changing
    requests unless the client returns the current session token in X-XSRF-TOKEN or -xsrf-.
    This is the automated guard for issue 10137.
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const XSRF_TEST = HTTP + '/action/sessionXsrfTest'
const SESSION_TEST = HTTP + '/action/sessionTest'

function xsrfToken(headers: string): string {
    let m = headers.match(/^X-XSRF-TOKEN:\s*([^\r\n]+)/im)
    return m ? m[1] : ''
}

function badToken(token: string): string {
    return token.substring(0, token.length - 1) + (token.endsWith('a') ? 'b' : 'a')
}

//  A safe request creates the session and returns the token as both header and cookie.
let r = await req(XSRF_TEST, {body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number null'))
let cookie = sessionCookie(r.headers)
let token = xsrfToken(r.headers)
ttrue(cookie != '')
ttrue(token != '')
ttrue(/^[Ss]et-[Cc]ookie:\s*XSRF-TOKEN=/m.test(r.headers))

//  The live session alone is not enough for a protected state-changing request.
r = await req(XSRF_TEST, {cookie: cookie, post: 'number=11'})
ttrue(r.status == '403')

//  A safe request with the same session returns the current token after the failed attempt.
r = await req(XSRF_TEST, {cookie: cookie, body: true})
ttrue(r.status == '200')
token = xsrfToken(r.headers)
ttrue(token != '')

//  Supplying the current token in the header admits the POST.
r = await req(XSRF_TEST, {cookie: cookie, headers: {'X-XSRF-TOKEN': token}, post: 'number=12', body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 12'))

//  A near miss must be rejected.
r = await req(XSRF_TEST, {cookie: cookie, headers: {'X-XSRF-TOKEN': badToken(token)}, post: 'number=13'})
ttrue(r.status == '403')

//  The form-parameter fallback is accepted with the refreshed token.
r = await req(XSRF_TEST, {cookie: cookie, body: true})
ttrue(r.status == '200')
token = xsrfToken(r.headers)
ttrue(token != '')

r = await req(XSRF_TEST, {cookie: cookie, post: 'number=14&-xsrf-=' + token, body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 14'))

//  Negative pin: routes without XSRF remain compatible with tokenless POST.
r = await req(SESSION_TEST, {post: 'number=15', body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 15'))
