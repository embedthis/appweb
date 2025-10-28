/*
    basic.tst - Basic authentication tests

    Tests HTTP Basic authentication with various user credentials and access controls.
    Verifies that users can access protected resources with valid credentials and
    are denied access with invalid or missing credentials.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http

// Test valid user "mary" can access basic auth protected resource
http.setCredentials("mary", "pass2")
http.get(HTTP + "/auth/basic/basic.html")
await http.finalize()
ttrue(http.status == 200)

// Test access to joshua-only resource without credentials (should fail)
http.setCredentials(null, null)
http.get(HTTP + "/auth/basic/joshua/user.html")
await http.finalize()
ttrue(http.status == 401)

// Test access to joshua-only resource with valid joshua credentials (should succeed)
http.setCredentials("joshua", "pass1")
http.get(HTTP + "/auth/basic/joshua/user.html")
await http.finalize()
ttrue(http.status == 200)

// Test access to joshua-only resource with different valid user (should be forbidden)
http.setCredentials("mary", "pass2")
http.get(HTTP + "/auth/basic/joshua/user.html")
await http.finalize()
ttrue(http.status == 403)

http.close()
