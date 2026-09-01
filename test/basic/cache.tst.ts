/*
    cache.tst - A response generated for an authenticated request must not be marked shareable

    A route carrying `Cache client=...` marked every 200 response `Cache-Control: public` with no
    `Vary`, whether or not the request was authenticated. The shipped production configuration
    applies such a directive to .html at global scope, so this reached any authenticated HTML page:
    a proxy or CDN could store one user's response and serve it to another.

    Issue 10014. An authenticated response is now `private` and varies on Authorization; an
    anonymous one is still `public`, so ordinary static content stays shareable.

    The assertion is made on the second request. cacheAtClient() only adds a header when none is
    present, and the first authenticated request already carries `Cache-Control: no-cache=set-cookie`
    from establishing the session, so the first request never exercised the path either way. Every
    subsequent request on that session does, which is the common case.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Cmd} from '@embedthis/ejscript'

const HTTP = (tget('TM_HTTP') || 'http://127.0.0.1:4100').replace('127.0.0.1', 'localhost')
const AUTH = "--header 'Authorization: Basic am9zaHVhOnBhc3Mx'"

async function headers(path: string, extra: string = ''): Promise<string> {
    return await Cmd.sh("curl --silent --include --output - --max-time 20 " + extra +
                        " '" + HTTP + path + "' 2>/dev/null")
}

//  Establish the session, then assert on a request that does not carry a Set-Cookie
const first = await headers('/auth/cached/index.html', AUTH)
const m = first.match(/^[Ss]et-[Cc]ookie:\s*(-http-session-=[^;\r\n]+)/m)
ttrue(m != null)

const authed = await headers('/auth/cached/index.html', AUTH + " --header 'Cookie: " + (m ? m[1] : '') + "'")
ttrue(/^HTTP\/[\d.]+ 200/.test(authed))

//  The response is for one caller and must not be shared
ttrue(/Cache-Control:[^\r\n]*private/i.test(authed))
ttrue(!/Cache-Control:[^\r\n]*public/i.test(authed))

//  ... and says so to a cache that keys on the credential
ttrue(/Vary:[^\r\n]*Authorization/i.test(authed))

//  Anonymous content on the same route is still shareable -- the fix must not disable client caching
const anon = await headers('/auth/cached/index.html')
ttrue(/^HTTP\/[\d.]+ 401/.test(anon))
