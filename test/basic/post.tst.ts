/*
    post.tst - Post method tests

    Tests HTTP POST method with various data types including raw strings and
    form-encoded data. Currently uses EJS endpoints.

    TODO - Convert tests to use ESP endpoints instead of EJS
    TODO - Add more comprehensive POST testing scenarios
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

if (thas('ME_EJS')) {
    // Test POST with raw string data
    http.post(HTTP + "/form.ejs", "Some data")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test POST with form-encoded key-value pairs
    http.form(HTTP + "/form.ejs", {name: "John", address: "700 Park Ave"})
    await http.finalize()
    ttrue(http.response.contains('"name": "John"'))
    ttrue(http.response.contains('"address": "700 Park Ave"'))
    http.close()

} else {
    tskip("ejs not enabled")
} 
