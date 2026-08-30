/*
    digest-replay.tst - A Digest credential is bound to one request-target and is used once

    Four properties are pinned here. Each was absent, and together they made a captured
    "Authorization: Digest" header replayable, unchanged, an unlimited number of times, against any
    path the user's route grants:

    1. The uri parameter must name the request-target (RFC 7616 3.4.6). HA2 is computed from that
       field on both sides, so without the comparison the digest still verifies when the header is
       moved to another request line, and the authorization decision is then made on the new path.
    2. The nonce count must increase on every request that reuses a nonce (RFC 7616 3.4.3). The
       server records the highest value seen, which is what makes each credential single-use.
    3. The client's realm must match the route's realm. HA1 comes from the user store rather than
       being recomputed from the client's realm, so any realm= value was previously accepted.
    4. "user" is not an RFC parameter and is not an alias for "username", and a parameter that
       appears twice is rejected rather than letting the last occurrence win.

    The nonce lifetime is exercised at depth 2 and above -- the only way to observe it is to wait
    out ME_DIGEST_NONCE_DURATION.
 */

import {tdepth, tget, tinfo, ttrue} from '@embedthis/testme'
import {createHash} from 'crypto'

const HTTP = tget('TM_HTTP') || "http://127.0.0.1:4100"
const REALM = "example.com"
const USER = "joshua"
const PASSWORD = "pass1"

//  joshua may read both of these; the executive document needs a role joshua does not hold
const URI = "/auth/digest/digest.html"
const OWN_URI = "/auth/digest/joshua/user.html"
const EXEC_URI = "/auth/digest/executive/executive.html"

//  mary holds the executive role, so a header that authenticates as mary reaches EXEC_URI
const OTHER_USER = "mary"
const OTHER_PASSWORD = "pass2"

//  ME_DIGEST_NONCE_DURATION, in seconds
const NONCE_DURATION = 60

const md5 = (s: string) => createHash('md5').update(s).digest('hex')

type Credential = {
    nonce: string,
    uri: string,
    nc?: string,
    cnonce?: string,
    qop?: string | null,        // null omits qop entirely (RFC 2069 form)
    realm?: string,             // realm= value only; HA1 always uses the server realm
    user?: string,
    password?: string,
    extra?: string,             // raw parameters appended to the header
}

/*
    Solicit a challenge and return its parsed parameters
 */
async function challenge(path: string = URI): Promise<Record<string, string>> {
    const response = await fetch(HTTP + path)
    ttrue(response.status == 401)

    const header = response.headers.get('www-authenticate') || ''
    const params: Record<string, string> = {}
    for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) {
        params[key] = value
    }
    ttrue(params.nonce != null)
    return params
}

/*
    Build an Authorization header. Passwords in appweb.conf are stored as the HA1 digest, so HA1 is
    recomputed here the same way -- and always over the server's realm, so that a wrong realm= is
    tested on its own rather than by way of a digest that no longer verifies.
 */
function authorization(c: Credential): string {
    const user = c.user ?? USER
    const password = c.password ?? PASSWORD
    const realm = c.realm ?? REALM
    const nc = c.nc ?? "00000001"
    const cnonce = c.cnonce ?? "0a4f113b"
    const ha1 = md5(`${user}:${REALM}:${password}`)
    const ha2 = md5(`GET:${c.uri}`)
    let header: string

    if (c.qop === null) {
        const response = md5(`${ha1}:${c.nonce}:${ha2}`)
        header = `Digest username="${user}", realm="${realm}", nonce="${c.nonce}", ` +
                 `uri="${c.uri}", response="${response}"`
    } else {
        const qop = c.qop ?? "auth"
        const response = md5(`${ha1}:${c.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        header = `Digest username="${user}", realm="${realm}", nonce="${c.nonce}", uri="${c.uri}", ` +
                 `qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`
    }
    return c.extra ? `${header}, ${c.extra}` : header
}

async function get(path: string, header: string): Promise<number> {
    const response = await fetch(HTTP + path, {headers: {Authorization: header}})
    return response.status
}

/*
    A complete, correct exchange still authenticates. Everything below is a departure from this one.
 */
let nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: URI})) == 200)

/*
    The credential is bound to its request-target. Both replays carried a 200 before the uri
    comparison existed: the first because the header verified against a request line it was never
    computed for, the second because joshua may read that document.
 */
nonce = (await challenge()).nonce
let captured = authorization({nonce, uri: URI})
ttrue(await get(OWN_URI, captured) == 401)
ttrue(await get(EXEC_URI, captured) == 401)

/*
    ... and the request-target is compared, not merely the path prefix
 */
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: OWN_URI})) == 401)
ttrue(await get(URI, authorization({nonce, uri: "/index.html"})) == 401)

/*
    RFC 7616 3.4 names the effective request URI in uri=, so the absolute form is legitimate and is
    what the Ejscript client sends. It must be accepted when its path names the request, and refused
    when it does not -- the authority is not a way around the comparison.
 */
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: `${HTTP}${URI}`})) == 200)

nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: `${HTTP}${OWN_URI}`})) == 401)
ttrue(await get(OWN_URI, authorization({nonce, uri: `${HTTP}${URI}`})) == 401)

/*
    The credential is used once. A verbatim replay carries a count that is no longer greater than
    the one recorded against the nonce.
 */
nonce = (await challenge()).nonce
captured = authorization({nonce, uri: URI})
ttrue(await get(URI, captured) == 200)
ttrue(await get(URI, captured) == 401)
ttrue(await get(URI, captured) == 401)

/*
    The same nonce continues to serve while the count increases, which is what a real client does
 */
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "00000002"})) == 200)
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "00000003"})) == 200)

//  A count that is not greater than the high-water mark is refused, even though it once served
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "00000002"})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "00000001"})) == 401)

//  The count must be LHEX. Trailing rubbish is not read as a leading number.
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "0000001z"})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, nc: ""})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, nc: "00000000"})) == 401)

/*
    The realm the client names must be the route's realm. The response digest below is valid --
    only realm= differs -- so this isolates the check itself.
 */
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: URI, realm: "TOTALLY-WRONG"})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, realm: ""})) == 401)

/*
    A challenge that advertises qop may not be answered without one. Omitting qop is a downgrade to
    RFC 2069, where there is no count to track and the credential replays for the nonce's lifetime.
 */
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: URI, qop: null})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, qop: "auth-int"})) == 401)

/*
    "user" is not an alias for "username". The header below is computed for mary throughout and
    names joshua in the standard parameter, so a front-end reading username= sees joshua. It must
    not authenticate as mary -- EXEC_URI answered 200 to it when the alias was honoured, because
    mary holds the executive role that joshua does not.
 */
nonce = (await challenge()).nonce
let aliased = authorization({
    nonce, uri: EXEC_URI, user: OTHER_USER, password: OTHER_PASSWORD, extra: `user="${OTHER_USER}"`,
})
//  Sent with username="mary" it would authenticate; the alias is what is under test
aliased = aliased.replace(`username="${OTHER_USER}"`, `username="${USER}"`)
ttrue(await get(EXEC_URI, aliased) == 401)

/*
    A parameter that appears twice is rejected outright rather than letting the last occurrence
    win, so one header cannot carry two readings of the same field.
 */
nonce = (await challenge()).nonce
ttrue(await get(URI, authorization({nonce, uri: URI, extra: `username="${OTHER_USER}"`})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, extra: `uri="${OWN_URI}"`})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, extra: `nc=00000009`})) == 401)
ttrue(await get(URI, authorization({nonce, uri: URI, extra: `realm="${REALM}"`})) == 401)

/*
    The nonce expires. The staleness test compared a millisecond timestamp with a seconds one, so
    it never fired and a nonce stayed valid for the life of the process. Waiting it out is the only
    way to observe the lifetime, so this runs at depth 2 and above.
 */
if (tdepth() >= 2) {
    const aged = (await challenge()).nonce
    await new Promise(resolve => setTimeout(resolve, (NONCE_DURATION + 2) * 1000))
    ttrue(await get(URI, authorization({nonce: aged, uri: URI})) == 401)

    //  ... and a nonce inside the window is still good, so the lifetime holds in both directions
    const fresh = (await challenge()).nonce
    await new Promise(resolve => setTimeout(resolve, 2000))
    ttrue(await get(URI, authorization({nonce: fresh, uri: URI})) == 200)
} else {
    tinfo("Nonce expiry runs at depth 2 -- it must wait out the nonce lifetime")
}
