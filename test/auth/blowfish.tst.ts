/*
    blowfish.tst - Blowfish cipher authentication tests

    Tests HTTP authentication using Blowfish-encrypted passwords stored in the password file.
    Verifies that the server can correctly authenticate users whose passwords are encrypted
    with the Blowfish cipher algorithm.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Test authentication with Blowfish-encrypted password
http.setCredentials("ralph", "pass5")
http.get(HTTP + "/auth/blowfish/ralph.html")
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Welcome to Blowfish Basic - Access for ralph'))

http.close()
