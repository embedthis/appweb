/*
    stale-claims.tst.ts - Shipped documents claim no platform, framework, file or build system the product lacks
 */

import {ttrue} from '@embedthis/testme'
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {resolve} from 'node:path'

const TOP = resolve(import.meta.dir, '../..')

let files = ['README.md']
files.push(...readdirSync(resolve(TOP, 'doc/man')).filter(f => f.endsWith('.1')).map(f => 'doc/man/' + f))
files.push(...readdirSync(resolve(TOP, 'src/server')).filter(f => f.endsWith('.conf')).map(f => 'src/server/' + f))

let version = JSON.parse(readFileSync(resolve(TOP, 'package.json'), 'utf8')).version
for (let info of ['doc/user-information.md', `doc/releases/${version}/user-information.md`]) {
    if (existsSync(resolve(TOP, info))) {
        files.push(info)
        break
    }
}

const STALE = [
    /ESP and PHP web frameworks/,
    /\bmax\.conf\b/,
    /\bmain\.me\b/,
    /\bMakeMe\b/,
]

for (let file of files) {
    readFileSync(resolve(TOP, file), 'utf8').split('\n').forEach((line, index) => {
        let stale = STALE.find(pattern => pattern.test(line))
        let platform = /FreeRTOS|ESP32/.test(line) && !/not supported/.test(line)
        if (stale || platform) {
            console.log(`${file}:${index + 1} makes a stale claim: ${line.trim().slice(0, 120)}`)
        }
        ttrue(!stale && !platform)
    })
}
