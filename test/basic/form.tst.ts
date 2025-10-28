/*
    form.tst - Post form tests

    Tests HTTP POST requests with form data using application/x-www-form-urlencoded
    encoding. Tests empty forms, simple string data, and key-value pairs.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

if (thas('ME_ESP')) {

    // Test posting an empty form
    http.post(HTTP + "/form.esp", "")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test posting a simple string
    http.post(HTTP + "/form.esp", "Some data")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test posting form with multiple key-value pairs
    http.form(HTTP + "/form.esp", {name: "John", address: "700 Park Ave"})
    await http.finalize()
    ttrue(http.response.contains('name=John'))
    ttrue(http.response.contains('address=700 Park Ave'))
    http.close()

} else {
    tskip("ESP not enabled")
}
