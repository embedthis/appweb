/*
    exhaust.tst - A failed login must not allocate a session
 */

import {ttrue, tget} from '@embedthis/testme'
import {req, jar, sessionCookie} from './session'

const HTTPS = tget('TM_HTTPS') || 'https://localhost:4443'
const LOGIN = HTTPS + '/auth/form/login'
const PROTECTED = HTTPS + '/auth/form/index.html'

//  A single failed login hands back no session id
let r = await req(LOGIN, {post: 'username=nobody&password=bad'})
ttrue(sessionCookie(r.headers) == '')

//  Repeated failures likewise allocate nothing. Kept well under LimitRequestsPerClient (100).
for (let i = 0; i < 20; i++) {
    r = await req(LOGIN, {post: 'username=nobody' + i + '&password=bad'})
    ttrue(sessionCookie(r.headers) == '')
}

//  A wrong password for a REAL user is still a failure and still allocates nothing
r = await req(LOGIN, {post: 'username=joshua&password=wrong'})
ttrue(sessionCookie(r.headers) == '')

//  After all that, a genuine login still works - the table was never filled
const good = jar('exhaust-good')
r = await req(LOGIN, {jar: good, post: 'username=joshua&password=pass1'})
ttrue(r.status == '302')
ttrue(sessionCookie(r.headers) != '')

r = await req(PROTECTED, {jar: good})
ttrue(r.status == '200')

//  Release the session again so later tests are not affected
await req(HTTPS + '/auth/form/logout', {jar: good, post: 'logout=1'})
