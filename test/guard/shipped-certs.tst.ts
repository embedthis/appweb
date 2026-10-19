/*
    No shipped configuration, live or commented, names a certificate or key bundled in certs/. Their private halves
    ship in the archive, so a configuration that loads or trusts them is open to anyone.
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'

const TOP = resolve(import.meta.dir, '../..')
const SERVER = resolve(TOP, 'src/server')

let bundled = readdirSync(resolve(TOP, 'certs')).filter(f => /\.(crt|key)$/.test(f))
ttrue(bundled.length > 0)

let escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
let pattern = new RegExp('(^|[^\\w.-])(' + bundled.map(escape).join('|') + ')\\b')

for (let name of readdirSync(SERVER).filter(f => /\.(conf|json)$/.test(f))) {
    readFileSync(resolve(SERVER, name), 'utf8').split('\n').forEach((line, index) => {
        let match = line.match(pattern)
        if (match) {
            console.log(`src/server/${name}:${index + 1} names the bundled ${match[2]}`)
        }
        ttrue(!match)
    })
}
