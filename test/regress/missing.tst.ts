/*
    Test server handling of POST to missing resource

    This test verifies that the server returns 404 Not Found when posting
    to a non-existent endpoint.
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// POST to non-existent resource should return 404
http.post(HTTP + "/expect-missing", "")

await http.finalize()
ttrue(http.status == 404)
http.close()
