/*
    optional.tst.ts - Test optional route tokens
    Verifies that optional segments in route patterns work correctly
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Route pattern: ^/optional/{controller}(~/{action}~)
//  The action segment is optional

//  Test with controller only
http.get(HTTP + '/route/optional/user')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'user/')

//  Test with trailing slash
http.get(HTTP + '/route/optional/user/')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'user/')

//  Test with controller and action
http.get(HTTP + '/route/optional/user/login')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'user/login')
http.close()
