/*
    json-width.tst.ts - JSON element count is bounded on every pre-auth entry to the parser

    Depth was bounded first (see json-depth.tst.ts, issue 10146) and width was not. A flat array is
    one level deep and can hold as many elements as the byte budget allows. rxFormCount does not
    reach them: it counts immediate children of the parameter table, so a whole tree folded under one
    top-level key contributes exactly one. Issue 10312.

    What that cost was not the memory the finding predicted. Each element becomes a node on one
    sibling chain, and the collector marks such a chain by recursing once per link, so a long enough
    chain exhausts the marking thread's stack. Measured before the fix: a 40KB body -- far under
    rxBodySize -- killed the server with SIGBUS, "Thread stack size exceeded due to excessive
    recursion". Unauthenticated, one request, default configuration. The parse happens in
    processReady before routeRequest, so no route configuration is involved either. The collector
    defect itself is issue 10348; this bounds what the HTTP layer will build.

    ME_MAX_JSON_NODES now bounds it during the parse, so an oversized document is refused rather
    than built and then fatal to collect.
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

//  Well past ME_MAX_JSON_NODES (4096), and past the ~15-20k where the unfixed server died
const WIDE = 50 * 1000

//  Comfortably inside the limit -- this must still parse
const NARROW = 100

function array(count: number): string {
    return '{"a":[' + new Array(count).fill('0').join(',') + ']}'
}

/*
    The header must be set before post(), not after -- connect() sends immediately once it has a
    body, so a Content-Type applied afterwards never reaches the wire.
 */
async function post(path: string, body: string, contentType: string): Promise<Http> {
    let http: Http = new Http
    http.setHeader('Content-Type', contentType)
    http.post(HTTP + path, body)
    await http.finalize()
    return http
}

//  A single top-level key carrying more elements than the limit is rejected
let http = await post('/post', array(WIDE), 'application/json')
teq(http.status, 400)
http.close()

/*
    The assertion that matters. Before the fix the response above still arrived -- the process died
    afterwards, during collection -- so status alone does not prove the defect is closed. The server
    still serving a later request on a new connection is what does.
 */
http = await post('/post', '{"a":"ok"}', 'application/json')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
http.close()

//  Repeat the trigger: one refusal must not leave the server in a state a second one finishes off
for (let i = 0; i < 3; i++) {
    http = await post('/post', array(WIDE), 'application/json')
    teq(http.status, 400)
    http.close()
}
http = await post('/post', '{"a":"ok"}', 'application/json')
teq(http.status, 200)
http.close()

/*
    Width folded under a key is the case rxFormCount cannot see, so it is the case that must be
    covered here. Breadth at the top level was already refused before this fix, by rxFormCount, and
    must stay refused.
 */
http = await post('/post', '{' + new Array(12000).fill(0).map((_, i) => `"k${i}":0`).join(',') + '}',
                  'application/json')
ttrue(http.status == 400 || http.status == 413)
http.close()

//  Nested rather than flat: the same node budget applies whatever shape the elements are in
http = await post('/post', '{"a":[' + new Array(WIDE / 2).fill('[1]').join(',') + ']}', 'application/json')
teq(http.status, 400)
http.close()

/*
    The _encoded_json_ marker reaches the same parser from an ordinary form body with no JSON
    content type, and from the query string, which is parsed earlier still. Both entries must be
    bounded, matching how json-depth.tst.ts covers them for depth.
 */
http = await post('/post', array(WIDE) + '_encoded_json_', 'application/x-www-form-urlencoded')
teq(http.status, 400)
http.close()

/*
    The query string reaches the parser too, but LimitUri (4K by default) bounds that entry long
    before the node cap can: 4096 elements need more than 8K of text to express, so a query carrying
    enough of them is refused as an oversized URI first. Assert it is refused, not which limit did
    it -- pinning 400 here would be pinning LimitUri's value, not this fix.
 */
http = new Http
http.get(HTTP + '/post?' + array(WIDE) + '_encoded_json_')
await http.finalize()
ttrue(http.status == 400 || http.status == 413)
http.close()

//  Still serving after the alternate entries too
http = await post('/post', '{"a":"ok"}', 'application/json')
teq(http.status, 200)
http.close()

/*
    The limit must not be so low that real documents break. The largest JSON this product ships
    holds a few hundred elements, so a hundred-element array with named siblings must parse and
    every parameter must still reach ${param:...}.
 */
http = await post('/post', '{"a":"ok","list":[' + new Array(NARROW).fill('1').join(',') + '],"b":"two"}',
                  'application/json')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
ttrue(http.response.indexOf('b=[two]') >= 0)
http.close()

//  A form body carrying the same document parses too
http = await post('/post', 'a=ok&b=' + encodeURIComponent(array(NARROW)),
                  'application/x-www-form-urlencoded')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
http.close()

//  An ordinary query is unaffected
http = new Http
http.get(HTTP + '/post?a=1&b=2')
await http.finalize()
teq(http.status, 200)
ttrue(http.response.indexOf('a=[1]') >= 0)
ttrue(http.response.indexOf('b=[2]') >= 0)
http.close()
