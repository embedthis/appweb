/*
    multiplex-limit.tst.ts - A busy multiplex=1 app is never handed a second request

    With max=1 multiplex=1, one request holds the only app (fastProgram -d 3 delays its answer). Every other request
    waits for that app and, with a wait shorter than the delay, gives up with "Cannot allocate FastCGI app".
    fastProgram is multithreaded, so a request handed the busy app is answered alongside the first, within moments
    of it.

    A request may legitimately be served after the first finishes: MPR limits running workers to the CPU cores, so
    on a small machine some requests start only when earlier waiters give up. Such a request takes the whole delay
    again. So the oracle is that no two requests are answered closer together than the delay, not that only one is.

    A selected app is counted as busy from selection, not from when its request connects: an app selected but not
    yet connected must not look free to the next request. Many simultaneous requests make that window reachable.

    Results are asserted after withServer returns: a failed assertion ends the test, and inside the callback that
    would leave the private server running on its port.
 */

import {tinfo, ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'

const PORT = 4602
const ROUNDS = 5
const CLIENTS = 16
const DELAY = 3000
//  Allowance for the client measuring an answer after the server released the app
const SLACK = 500

if (process.platform == 'win32') {
    tinfo('SKIP: FastCGI is ME_UNIX_LIKE only')
} else {
    let completed = 0
    let failures: string[] = []
    await withServer('fast-multiplex-limit', PORT, [
        'LimitWorkers 16',
        '<Route ^/fast-bin/(.*)$>',
        '    AddHandler fastHandler',
        '    Prefix /fast-bin',
        `    Documents ${import.meta.dir}/../fast-bin`,
        '    FastConnect 127.0.0.1:0 launch keep min=0 max=1 multiplex=1 wait=1sec',
        '    Target run $1',
        '</Route>',
    ], async () => {
        let url = `http://127.0.0.1:${PORT}/fast-bin/fastProgram?SWITCHES=-d%20${DELAY / 1000}`
        for (let round = 1; round <= ROUNDS; round++) {
            let start = Date.now()
            let results = await Promise.all(Array.from({length: CLIENTS}, () =>
                fetch(url, {signal: AbortSignal.timeout(30000)}).then(async response => {
                    await response.arrayBuffer()
                    return {code: response.status, ms: Date.now() - start}
                }).catch(() => ({code: 0, ms: Date.now() - start}))))
            let answered = results.filter(result => result.code == 200).map(result => result.ms).sort((a, b) => a - b)
            let shared = answered.some((ms, i) => i > 0 && ms - answered[i - 1] < DELAY - SLACK)
            if (answered.length == 0 || shared) {
                failures.push(`round ${round}: code@ms ${results.map(result => `${result.code}@${result.ms}`).join(' ')}`)
            }
            completed++
        }
    })
    ttrue(completed == ROUNDS)
    for (let failure of failures) {
        tinfo(failure)
    }
    ttrue(failures.length == 0, 'every round answers a request, and no two answers share the app')
}
