/*
    casefold.tst - Route authentication must not be bypassable by changing the case of the URI

    On a case-insensitive filesystem (macOS APFS/HFS+, Windows NTFS/FAT, exFAT, vfat), open()
    resolves /AUTH/BASIC/basic.html and /auth/basic/basic.html to the same file, but route selection
    used to compare the request path byte-exactly. An upper-case spelling of a protected URI
    therefore missed the route guarding it and fell through to the next matching route - serving
    protected content to an unauthenticated client with a single ordinary GET.

    The unit-level coverage of the comparison primitives lives with the http module. This file
    covers the route-selection call sites, which need a real request against a real route table and
    so are only observable end to end.

    This test is only meaningful where the filesystem folds case, because that is the precondition
    for the bypass. On a case-sensitive volume the variant URIs name files that do not exist, so the
    correct answer is 404 rather than 401 - both are non-200, which is what the assertions require.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http

/*
    Case variants of a document under <Route ^/auth/basic/> which requires AuthType basic.
    None may be served without credentials.
 */
const variants = [
    "/AUTH/BASIC/basic.html",
    "/auth/BASIC/basic.html",
    "/Auth/Basic/basic.html",
    "/AUTH/basic/basic.html",
    "/auth/basic/BASIC.HTML",
]

// Control: the exact spelling is protected
http.setCredentials(null, null)
http.get(HTTP + "/auth/basic/basic.html")
await http.finalize()
ttrue(http.status == 401)

// No case variant may be served to an unauthenticated client
for (let uri of variants) {
    http.setCredentials(null, null)
    http.get(HTTP + uri)
    await http.finalize()
    ttrue(http.status != 200)
}

// Control: valid credentials still work on the exact spelling
http.setCredentials("joshua", "pass1")
http.get(HTTP + "/auth/basic/basic.html")
await http.finalize()
ttrue(http.status == 200)

/*
    The fix must not be over-broad. A path that merely shares a prefix with the protected route is a
    different resource and must still 404, not be captured by the route.
 */
http.setCredentials(null, null)
http.get(HTTP + "/auth/basicX/basic.html")
await http.finalize()
ttrue(http.status == 404)

/*
    Role-scoped sub-routes must fold too. <Route ^/auth/basic/executive/> requires the executive
    role, so a case variant must not demote the request to the parent route's weaker requirement.
 */
http.setCredentials("joshua", "pass1")
http.get(HTTP + "/auth/basic/EXECUTIVE/executive.html")
await http.finalize()
ttrue(http.status != 200)

// Digest and form routes use the same route matching path
http.setCredentials(null, null)
http.get(HTTP + "/AUTH/DIGEST/digest.html")
await http.finalize()
ttrue(http.status != 200)

/*
    Unprotected content must be unaffected by the folding change - this is the regression guard on
    ordinary traffic, which is the bulk of what the change touches.
 */
http.setCredentials(null, null)
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)
