/*
    redirect.tst - Redirection tests

    Tests HTTP redirect handling including automatic following of redirects
    and manual redirect control.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test automatic redirect following
http.followRedirects = true
http.get(HTTP + "/dir")
await http.finalize()
ttrue(http.status == 200)
