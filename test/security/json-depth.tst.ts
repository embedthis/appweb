/*
    json-depth.tst.ts - JSON nesting depth is bounded on every pre-auth entry to the parser

    mprJsonParser is recursive descent and recurses on the opening brace or bracket, before any
    matching close is required. A run of open brackets alone therefore drove it as deep as the
    input was long, and the only limits in the product are byte counts a deep document satisfies
    easily. The parse happens in processReady before routeRequest, so no auth is required.

    ME_MAX_JSON_DEPTH now bounds it, and a rejected document must produce a 400 rather than be
    silently treated as "no parameters" -- otherwise a request the parser refused is
    indistinguishable from one that carried none. See issue 10146.
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

//  Well past ME_MAX_JSON_DEPTH (64) but small enough to keep the test quick
const DEEP = 500

//  Large enough that an unbounded parser exhausts the stack rather than merely recursing deeply
const HUGE = 100 * 1024

function brackets(count: number): string {
    return '['.repeat(count)
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

//  A JSON body nested past the limit is rejected, not accepted with an empty parameter set
let http = await post('/post', brackets(DEEP), 'application/json')
teq(http.status, 400)
http.close()

//  The same shape at attack scale is still a 400, not a crash or a reset connection
http = await post('/post', brackets(HUGE), 'application/json')
teq(http.status, 400)
http.close()

//  The server survived: the very next request on a new connection is served normally
http = await post('/post', '{"a":"ok"}', 'application/json')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
http.close()

/*
    The _encoded_json_ marker reaches the same parser from an ordinary form body with no JSON
    content type at all. That branch discarded the parse result entirely, so a rejected document
    would have been reported as success with no parameters.
 */
http = await post('/post', brackets(DEEP) + '_encoded_json_', 'application/x-www-form-urlencoded')
teq(http.status, 400)
http.close()

http = await post('/post', brackets(HUGE) + '_encoded_json_', 'application/x-www-form-urlencoded')
teq(http.status, 400)
http.close()

/*
    And from the query string, which is parsed even earlier -- in processParsed, before the body
    has arrived. The marker is a substring test over the whole buffer, so trailing it after the
    brackets is enough to select the JSON grammar. See #10150 for that trigger, which is why the
    marker cannot be written here as the leading "_encoded_json_=" name it was meant to be.
 */
http = new Http
http.get(HTTP + '/post?' + brackets(DEEP) + '_encoded_json_')
await http.finalize()
teq(http.status, 400)
http.close()

/*
    The limit must not be so low that real clients break. Ten levels is deeper than any request
    document in practice and must still parse, with every parameter reaching ${param:...}.
 */
const NESTED = '{"a":"ok","b":[[[[[[[[[["deep"]]]]]]]]]],"c":{"c":{"c":{"c":{"c":{"c":1}}}}}}'

http = await post('/post', NESTED, 'application/json')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
http.close()

//  A form body at the same depth parses too
http = await post('/post', 'a=ok&b=' + encodeURIComponent(NESTED), 'application/x-www-form-urlencoded')
teq(http.status, 200)
ttrue(http.response.indexOf('a=[ok]') >= 0)
http.close()

//  An ordinary query is unaffected -- the marker is what selects the JSON grammar
http = new Http
http.get(HTTP + '/post?a=1&b=2')
await http.finalize()
teq(http.status, 200)
ttrue(http.response.indexOf('a=[1]') >= 0)
ttrue(http.response.indexOf('b=[2]') >= 0)
http.close()

//  A malformed body is a 400 with a response, not a hung connection with no reply at all
http = await post('/post', '{', 'application/json')
teq(http.status, 400)
http.close()
