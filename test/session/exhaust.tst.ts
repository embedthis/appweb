/*
    exhaust.tst - A failed login must not allocate a session

    If a failed login allocates, an anonymous client can fill the session table with nothing but bad
    credentials and lock every legitimate user out of form authentication. GoAhead carried exactly
    this defect (their issue #10040): ~512 anonymous requests exhausted the table.

    Ported from GoAhead test/session/exhaust.tst.ts (issue 10060), but DELIBERATELY SCOPED.

    GoAhead's version fills the session table to prove the ceiling holds. That cannot be done here:
    test/appweb.conf sets LimitSessions 200 but LimitRequestsPerClient 100, so filling the table
    needs more requests from one client than the request limit allows, and the monitor's
    "Defense deny REMEDY=ban" would ban the test runner and cascade failures into every later test -
    the same hazard that keeps test/stress disabled (issue 10043). This asserts the security
    property, which is that failures allocate nothing, without needing the volume.
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
await req(HTTPS + '/auth/form/logout', {jar: good})
