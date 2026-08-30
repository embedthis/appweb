/*
    Test proxy handling of HTTP POST requests

    This test verifies that the proxy correctly forwards POST form data and returns responses
    from the backend server. The backend echoes the form parameters it received.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'

let http: Http = new Http

//  Test simple form POST through proxy
http.form(HTTP + "/post", {data: "Some data"})
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('data=[Some data]'))
http.close()

//  Test multi-field form POST through proxy
http.form(HTTP + "/post", {name: "John", address: "700 Park Ave"})
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('name=[John]'))
ttrue(http.response.contains('address=[700 Park Ave]'))
http.close()
