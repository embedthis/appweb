/*
    digest.tst - Digest authentication tests

    Tests HTTP Digest authentication which provides more secure authentication than Basic
    by using MD5 hashing. Tests both general authenticated access and user-specific
    access controls.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test access to unprotected resource (sanity check)
http.setCredentials("anybody", "PASSWORD WONT MATTER")
http.get(HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

// Test access to digest-protected resource without credentials (should fail)
http.reset()
http.get(HTTP + "/auth/digest/digest.html")
await http.finalize()
ttrue(http.status == 401)

// Test valid user "joshua" can access digest-protected resource
http.setCredentials("joshua", "pass1")
http.get(HTTP + "/auth/digest/digest.html")
await http.finalize()
ttrue(http.status == 200)

// Test valid user "mary" can also access digest-protected resource
http.setCredentials("mary", "pass2")
http.get(HTTP + "/auth/digest/digest.html")
await http.finalize()
ttrue(http.status == 200)

// Test access to joshua-only resource without credentials (should fail)
http.setCredentials(null, null)
http.get(HTTP + "/auth/digest/joshua/user.html")
await http.finalize()
ttrue(http.status == 401)

// Test access to joshua-only resource with valid joshua credentials (should succeed)
http.setCredentials("joshua", "pass1")
http.get(HTTP + "/auth/digest/joshua/user.html")
await http.finalize()
ttrue(http.status == 200)

// Test access to joshua-only resource with different valid user (should be forbidden)
http.setCredentials("mary", "pass2")
http.get(HTTP + "/auth/digest/joshua/user.html")
await http.finalize()
ttrue(http.status == 403)

http.close()
