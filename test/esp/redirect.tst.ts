/*
    redirect.tst.ts - Test ESP redirect functionality
    Verifies that ESP can issue HTTP redirects
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test redirect without following
http.followRedirects = false
http.get(HTTP + '/redirect.esp')
await http.finalize()
ttrue(http.status == 302)
ttrue(http.response.contains('<h1>Moved Temporarily</h1>'))
http.close()

//  Test redirect with automatic following
http.followRedirects = true
http.get(HTTP + '/redirect.esp')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Greetings: Hello Home Page'))
http.close()
