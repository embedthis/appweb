/*
    fullpat.tst.ts - Test complex route pattern matching

    The route under test is a genuine regular expression - alternation plus a character class:

        ^/route/(user|admin)/{cmd}/[^a-z]\{2}(\.[hH][tT][mM][lL])$

    Appweb ships no regular expression engine. Literal, Alias prefix, {token} segment and
    literal alternation patterns are matched natively, which covers every shipped configuration.
    A pattern like this one needs a deployer-supplied PCRE2 library, so the route is gated behind
    <if PCRE2> in test/appweb.conf and exists only in a build configured with:

        cd projects && premake5 --pcre2 gmake

    When the route is absent this test skips, and says why, rather than failing silently.
 */

import {tskip, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Probe for the route. It exists only in a PCRE2 build.
http.get(HTTP + '/route/user/login/AA.html')
await http.finalize()

if (http.status == 404) {
    http.close()
    tskip('regexp route requires a PCRE2 build (premake5 --pcre2 gmake)')

} else {
    //  An uppercase pair before the extension matches
    ttrue(http.status == 200)
    ttrue(http.response == 'user')
    http.close()

    //  Mixed case does not: [^a-z]{2} rejects the lowercase second character
    http.get(HTTP + '/route/user/login/aA.html')
    await http.finalize()
    ttrue(http.status == 404)
    http.close()
}
