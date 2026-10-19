/* No shipped configuration may enable unauthenticated uploads. */

import {ttrue} from '@embedthis/testme'
import {readFileSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'

const SERVER = resolve(import.meta.dir, '../../src/server')

for (let name of readdirSync(SERVER).filter(f => f.endsWith('.conf'))) {
    let lines = readFileSync(resolve(SERVER, name), 'utf8').split('\n')
        .map(l => l.replace(/#.*/, '').trim()).filter(l => l)
    let stack: string[][] = []
    let offenders: string[] = []
    for (let line of lines) {
        if (/^<Route\b/i.test(line)) {
            stack.push([line])
        } else if (/^<\/Route>/i.test(line)) {
            let block = stack.pop() || []
            let uploads = block.some(l => /^AddFilter\s+uploadFilter\b/i.test(l))
            let authenticated = block.some(l => /^(AuthType|Require)\b/i.test(l))
            if (uploads && !authenticated) {
                offenders.push(block[0])
            }
        } else if (stack.length) {
            stack[stack.length - 1].push(line)
        }
    }
    if (offenders.length) {
        console.log(`unauthenticated upload routes in src/server/${name}: ${offenders.join(', ')}`)
    }
    ttrue(offenders.length == 0)
}
