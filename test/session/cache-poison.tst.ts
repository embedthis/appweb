/*
    cache-poison.tst - A client cookie must not name a response-cache entry as a session.

    Issue 10138. Session state and cached responses used to share the same MPR cache singleton, and
    httpGetSessionID accepted the raw cookie as a cache key. A crafted cookie shaped like a response
    cache key could therefore be adopted as a session and overwritten by session writes.
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie, COOKIE} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SESSION_TEST = HTTP + '/action/sessionTest'
const SESSION_CACHE_TEST = HTTP + '/action/sessionCacheTest'
const BAD = COOKIE + '=http::response::::/action/sessionCacheTest'

/*
    Prime the server response cache. The second POST proves the cached response is actually served.
 */
let r = await req(SESSION_CACHE_TEST, {post: 'number=41', body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 41'))

r = await req(SESSION_CACHE_TEST, {post: 'number=42', body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 41'))
ttrue(!r.body.contains('Number 42'))
ttrue(/^[Ee][Tt]ag:/m.test(r.headers))

/*
    A malformed session id must be ignored. The write gets a fresh, server-shaped id and must not
    replace the cached response body with serialized session data.
 */
r = await req(SESSION_TEST, {cookie: BAD, post: 'number=99', body: true})
ttrue(r.status == '200')
let issued = sessionCookie(r.headers)
ttrue(issued != '')
ttrue(issued.contains('::http.session::'))
ttrue(!issued.contains('http::response::'))

r = await req(SESSION_CACHE_TEST, {post: 'number=100', body: true})
ttrue(r.status == '200')
ttrue(r.body.contains('Number 41'))
ttrue(!r.body.contains('Number 99'))
ttrue(!r.body.contains('Number 100'))
