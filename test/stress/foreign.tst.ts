/*
    foreign.tst.ts - Stress test foreign thread handling
    Verifies that endpoints using foreign threads can handle repeated requests
 */

import {print, tdepth, tget, tinfo, ttrue} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

//  Scale iterations with test depth
var iterations = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]

let http: Http = new Http

//  Test foreign thread endpoint repeatedly
let uri = HTTP + '/foreign'
let count = iterations[tdepth()] * 100

tinfo('Request', '/foreign', count, 'times')
for (let i = 0; i < count; i++) {
    http.get(uri)
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('message: Hello World'))
    http.close()
}

//  Test event endpoint repeatedly
uri = HTTP + '/event'
tinfo('Request', '/event', count, 'times')
for (i = 0; i < count; i++) {
    http.get(uri)
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('done'))
    http.close()
}
