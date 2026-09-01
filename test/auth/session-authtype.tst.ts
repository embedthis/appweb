/*
    session-authtype.tst - A cached session must not satisfy a route requiring a different protocol

    Once a session existed, httpAuthenticate() accepted it for any route without checking that the
    session was established under the protocol that route requires. A Basic login therefore opened a
    route configured `AuthType digest`, with no Authorization header present at all. The ability
    layer was unaffected: it was specifically the protocol requirement that went unenforced.

    Issue 10019. The session now records the protocol that created it and the route's requirement is
    checked against it.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Cmd} from '@embedthis/ejscript'

const HTTP = (tget('TM_HTTP') || 'http://127.0.0.1:4100').replace('127.0.0.1', 'localhost')

async function curl(args: string): Promise<string> {
    return (await Cmd.sh("curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 " +
                         args + " 2>/dev/null")).trim()
}

/*
    Log in on the Basic route and keep the session cookie it issues
 */
const headers = await Cmd.sh("curl --silent --include --max-time 20 " +
    "--header 'Authorization: Basic am9zaHVhOnBhc3Mx' '" + HTTP + "/auth/basic/basic.html' 2>/dev/null")
const m = headers.match(/^[Ss]et-[Cc]ookie:\s*(-http-session-=[^;\r\n]+)/m)
ttrue(m != null)
const cookie = m ? m[1] : ''

//  The session works on the route that created it
ttrue(await curl("--header 'Cookie: " + cookie + "' '" + HTTP + "/auth/basic/basic.html'") == '200')

//  ... and does not satisfy a route requiring a different protocol
ttrue(await curl("--header 'Cookie: " + cookie + "' '" + HTTP + "/auth/digest/digest.html'") == '401')

//  Control: the digest route is reachable with no cookie at all, and still challenges
ttrue(await curl("'" + HTTP + "/auth/digest/digest.html'") == '401')

//  A form-established session likewise does not satisfy the Basic route
const formHeaders = await Cmd.sh("curl --silent --include --insecure --max-time 20 " +
    "--data 'username=joshua&password=pass1' '" +
    (tget('TM_HTTPS') || 'https://localhost:4443') + "/auth/form/login' 2>/dev/null")
const fm = formHeaders.match(/^[Ss]et-[Cc]ookie:\s*(-http-session-=[^;\r\n]+)/m)
if (fm) {
    ttrue(await curl("--header 'Cookie: " + fm[1] + "' '" + HTTP + "/auth/basic/basic.html'") == '401')
}
