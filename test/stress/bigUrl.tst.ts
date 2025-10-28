/*
    bigUrl.tst.ts - Stress test URL length limits
    Verifies that URLs within limits work and excessive URLs are rejected
 */

import {print, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

let http: Http = new Http

//  Build query string within server's 5K URI limit
let query = ''
for (let i in 200) {
    query += + 'key' + i + '=' + 1234567890 + '&'
}
query = query.trim('&')

//  Test valid URL within limits
let uri = HTTP + '/index.html?' + query
http.get(uri)
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Hello /index.html'))
http.close()

//  Double the query to exceed limits
query = query + '&' + query

//  Test URL exceeding limits - should fail
uri = HTTP + '/index.html?' + query
let caught
try {
    http.get(uri)
    await http.finalize()
    ttrue(0)
} catch (e) {
    caught = true
}
ttrue(caught)
http.close()
