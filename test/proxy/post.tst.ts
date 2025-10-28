/*
    Test proxy handling of HTTP POST requests

    This test verifies that the proxy correctly forwards POST form data and
    returns responses from the backend server.
 */

import {thas, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'

let http: Http = new Http

if (thas('ME_ESP')) {
    // Test simple form POST through proxy
    http.form(HTTP + "/form.esp", {data: "Some data"})

    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test multi-field form POST through proxy
    http.form(HTTP + "/form.esp", {name: "John", address: "700 Park Ave"})

    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('FORM name=John'))
    ttrue(http.response.contains('FORM address=700 Park Ave'))
    http.close()
}
