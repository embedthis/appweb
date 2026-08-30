/*
    cache-cookie.tst.ts - Proxy Set-Cookie must not be replayed from the shared response cache

    Issue 10093. A proxied backend can write Set-Cookie directly into tx->headers before the cache
    filter snapshots response headers. The server-side cache must filter it while still caching the
    response body.
 */

import {ttrue, tget} from '@embedthis/testme'
import {Cmd} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || 'http://localhost:4100'
const path = '/cached-proxy-cookie/proxy-cache-cookie/' + Date.now()

async function get(path: string): Promise<string> {
    return await Cmd.sh("curl --silent --include --output - --max-time 20 '" + HTTP + path + "' 2>/dev/null")
}

const first = await get(path)
ttrue(/^HTTP\/[\d.]+ 200/m.test(first))
ttrue(/^[Ss]et-[Cc]ookie:\s*backend-session=from-backend;/m.test(first))
ttrue(first.endsWith('cacheable proxy body'))

const second = await get(path)
ttrue(/^HTTP\/[\d.]+ 200/m.test(second))
ttrue(!/^[Ss]et-[Cc]ookie:/m.test(second))
ttrue(/^[Ee][Tt]ag:/m.test(second))
ttrue(second.endsWith('cacheable proxy body'))
