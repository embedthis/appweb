/*
    bigUrl.tst.ts - Stress test URL length limits

    Verifies that a URL within LimitUri is served and one beyond it is rejected by the server
    rather than truncated or accepted.

    This asserted the wrong side of the exchange and never reached the server with an oversized
    URL at all (10069). It built the query with `query += + 'key' + i + ...`; the stray unary plus
    makes `+'key'` NaN, so every field was named "NaN" and the string never grew near the limit.
    The loops were `for (let i in 200)`, which iterates the properties of a Number -- there are
    none -- so the body never ran either. It then asserted that the *client* threw, which is a
    property of the Ejscript HTTP client, not of Appweb. What matters here is the status the
    server returns, so that is what is asserted now.
 */

import {tget, ttrue} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

//  LimitUri is 4K in test/appweb.conf. Build a query comfortably inside it.
function buildQuery(fields: number): string {
    let parts: string[] = []
    for (let i = 0; i < fields; i++) {
        parts.push('key' + i + '=' + 1234567890)
    }
    return parts.join('&')
}

//  ~2K: within the 4K limit
let query = buildQuery(120)
ttrue(query.length < 4096)

let http: Http = new Http
http.get(HTTP + '/index.html?' + query)
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response.contains('Hello /index.html'))
http.close()

//  Well beyond the 4K limit. The server must reject it, not serve it.
let big = buildQuery(1200)
ttrue(big.length > 4096)

http = new Http
let status = 0
try {
    http.get(HTTP + '/index.html?' + big)
    await http.finalize()
    status = http.status
} catch {
    /*
        Appweb may close the connection rather than answer once the request line exceeds what it
        will buffer. Either is a rejection; being served a 200 is not.
     */
    status = -1
}
ttrue(status != 200)
http.close()
