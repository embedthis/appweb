/*
    cache-cookie.tst - Application cookies must not be replayed from the shared response cache
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, sessionCookie} from './session'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const SESSION_CACHE_TEST = HTTP + '/action/sessionCacheCookieTest'

const first = await req(SESSION_CACHE_TEST, {post: 'number=41', body: true})
ttrue(first.status == '200')
ttrue(first.body.contains('Number 41'))
ttrue(sessionCookie(first.headers) != '')

const second = await req(SESSION_CACHE_TEST, {post: 'number=99', body: true})
ttrue(second.status == '200')
ttrue(second.body.contains('Number 41'))
ttrue(!second.body.contains('Number 99'))
ttrue(sessionCookie(second.headers) == '')
ttrue(/^[Ee][Tt]ag:/m.test(second.headers))
