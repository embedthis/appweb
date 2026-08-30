/*
    Test FAST CGI custom HTTP status code responses

    This test verifies that FAST programs can set a custom HTTP status code in their responses, within the
    range HTTP defines. See header-injection.tst.ts for the full corpus of rejected Status values.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
import {contains, keyword, match} from "./fast"

// Test custom status code 511
let http = new Http
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-s%20511")

await http.finalize()
ttrue(http.status == 511)
http.close()

// A status outside 200-599 is not a status the server can relay, and fails the request
http.reset()
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-s%20711")
await http.finalize()
ttrue(http.status == 502)
http.close()
