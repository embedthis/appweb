/*
    access-log-concurrent.tst.ts - Check whole, unique log records under concurrent requests.
 */

import {teq, ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'

const PORT = 4564
const NAME = 'access-log-concurrent'
const COUNT = 200
const WAVE = 10

let work = workDir(NAME)
let log = resolve(work, 'access.log')

await withServer(NAME, PORT, [
    `TraceLog ${log} level=4 formatter=common format="%r %>s %{User-Agent}i"`,
    'LimitWorkers 8',
], async () => {
    // Keep each wave within the per-client connection limit.
    for (let wave = 0; wave < COUNT; wave += WAVE) {
        let requests = []
        for (let i = wave; i < wave + WAVE; i++) {
            requests.push(fetch(`http://127.0.0.1:${PORT}/index.html`, {headers: {'User-Agent': `agent-${i}-end`}})
                .then(r => r.text()))
        }
        await Promise.all(requests)
    }
    await Bun.sleep(500)

    let lines = readFileSync(log, 'utf8').split(/\r?\n/).filter(l => l.includes('agent-'))
    teq(lines.length, COUNT)
    let seen = new Set<string>()
    for (let line of lines) {
        let match = /^GET \/index.html HTTP\/1.1 200 agent-(\d+)-end$/.exec(line)
        if (!match) {
            console.log('malformed record: ' + JSON.stringify(line))
        }
        ttrue(match != null)
        if (match) {
            seen.add(match[1])
        }
    }
    teq(seen.size, COUNT)
})
