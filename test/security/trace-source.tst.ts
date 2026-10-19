/*
    trace-source.tst.ts - Trace records name the client, connection and stream
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from './server'
import {exchange} from './wire'

const PORT = 4599

await withServer('trace-source', PORT, [], async () => {
    let request = 'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'
    await Promise.all([exchange(PORT, request), exchange(PORT, request)])
    await Bun.sleep(300)
    let text = readFileSync(resolve(workDir('trace-source'), 'trace.log'), 'utf8')
    let sources = new Set<string>()
    for (let m of text.matchAll(/client:127\.0\.0\.1, net:(\d+), stream:(\d+)/g)) {
        sources.add(m[1])
    }
    if (sources.size < 2) {
        console.log(text.slice(0, 2000))
    }
    ttrue(sources.size >= 2)
})
