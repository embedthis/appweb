/*
    dirlist.tst - Directory listings

    Tests automatic directory listing generation when a directory is requested
    and directory listings are enabled in the server configuration.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Test directory listing generation
http.get(HTTP + "/listing/")
await http.finalize()
ttrue(http.status == 200)

http.close()
