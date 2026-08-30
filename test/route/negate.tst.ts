/*
    negate.tst.ts - Test negated route patterns

    A negated route ("<Route !pattern>") should match every request that does NOT match the
    pattern. With a literal pattern this previously matched nothing at all: finalizePattern()
    computed route->startWith regardless of the negation, and httpRouteRequest() applied that
    literal as a fast reject, so a path which did not begin with the literal was skipped
    before the negation could invert the result -- and a path which did begin with it was
    then rejected by the inversion. The route could never fire.

    The route under test is scoped by a Prefix, so it only applies under /route/negate.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  A path under the prefix that does NOT match the pattern: the negated route must fire
http.get(HTTP + '/route/negate/other')
await http.finalize()
ttrue(http.status == 200)
ttrue(http.response == 'NEGATED-OK')
http.close()

//  A path that DOES match the pattern: the negated route must reject it
http.get(HTTP + '/route/negate/skip')
await http.finalize()
ttrue(http.status != 200 || http.response != 'NEGATED-OK')
http.close()
