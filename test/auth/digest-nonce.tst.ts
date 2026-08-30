/*
    digest-nonce.tst - Digest nonce must not disclose the server secret (APPWEB-SA-2026-0001)

    The nonce is base64(MD5(secret:realm:hexTime:hexCounter):realm:hexTime:hexCounter). Base64 is a
    transport encoding, so anything placed in the nonce is readable by any client that solicits a
    challenge. These tests pin the nonce to that shape -- a 32-character hex digest in the leading
    field -- and confirm that a nonce whose digest was not produced by the server is rejected.
 */

import {ttrue, tget} from '@embedthis/testme'
import {createHash} from 'crypto'

const HTTP = tget('TM_HTTP') || "http://127.0.0.1:4100"
const URI = "/auth/digest/digest.html"
const REALM = "example.com"

const md5 = (s: string) => createHash('md5').update(s).digest('hex')

/*
    Solicit a challenge and return the parsed Digest parameters
 */
async function challenge(): Promise<Record<string, string>> {
    const response = await fetch(HTTP + URI)
    ttrue(response.status == 401)

    const header = response.headers.get('www-authenticate') || ''
    const params: Record<string, string> = {}
    for (const [, key, value] of header.matchAll(/(\w+)="([^"]*)"/g)) {
        params[key] = value
    }
    return params
}

/*
    Build an Authorization header for the given nonce. Passwords in auth.conf are stored as the
    HA1 digest, so HA1 is recomputed here the same way.
 */
function authorization(nonce: string, user: string, password: string): string {
    const cnonce = "0a4f113b"
    const nc = "00000001"
    const ha1 = md5(`${user}:${REALM}:${password}`)
    const ha2 = md5(`GET:${URI}`)
    const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`)

    return `Digest username="${user}", realm="${REALM}", nonce="${nonce}", uri="${URI}", ` +
           `qop=auth, nc=${nc}, cnonce="${cnonce}", response="${response}"`
}

//  The nonce must decode to hash:realm:hexTime:hexCounter with a 32-char hex digest leading
const first = await challenge()
const decoded = Buffer.from(first.nonce, 'base64').toString('utf8')
ttrue(/^[0-9a-f]{32}:[^:]+:[0-9a-f]+:[0-9a-f]+$/.test(decoded))

//  The realm is the only cleartext field carried over, and it is already public in the challenge
const fields = decoded.split(':')
ttrue(fields[1] == REALM)

//  Successive challenges must not repeat a nonce
const second = await challenge()
ttrue(first.nonce != second.nonce)
ttrue(Buffer.from(second.nonce, 'base64').toString('utf8').split(':')[0] != fields[0])

//  A server-issued nonce authenticates
let response = await fetch(HTTP + URI, {
    headers: {Authorization: authorization(second.nonce, "joshua", "pass1")},
})
ttrue(response.status == 200)

//  A nonce whose digest was not produced by the server is rejected. Without the secret an attacker
//  cannot compute the digest, so a forged nonce cannot be minted.
const forged = Buffer.from(['0'.repeat(32), fields[1], fields[2], fields[3]].join(':')).toString('base64')
response = await fetch(HTTP + URI, {
    headers: {Authorization: authorization(forged, "joshua", "pass1")},
})
ttrue(response.status == 401)

//  Tampering with any hashed field invalidates the nonce, because the digest no longer matches
const retimed = Buffer.from([fields[0], fields[1], 'ffffffffff', fields[3]].join(':')).toString('base64')
response = await fetch(HTTP + URI, {
    headers: {Authorization: authorization(retimed, "joshua", "pass1")},
})
ttrue(response.status == 401)
