/*
    shipped-artifacts.tst.ts - src/server ships no credentials, listens on loopback only, and its upload examples require TLS
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync, readdirSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

const SERVER = resolve(import.meta.dir, '../../src/server')

//  Every text file at the top of src/server, comments included
for (let name of readdirSync(SERVER)) {
    let path = resolve(SERVER, name)
    if (!statSync(path).isFile() || /\.(c|ico)$/.test(name)) {
        continue
    }
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        let bad = /\b[0-9a-fA-F]{32}\b/.test(line) || /^\s*#?\s*User\s+\S+\s+\S+/.test(line)
        if (bad) {
            console.log(`src/server/${name}:${index + 1} carries a credential: ${line.trim()}`)
        }
        ttrue(!bad)
    })
}

//  The source-tree listeners are loopback only
let listens = readFileSync(resolve(SERVER, 'install.conf'), 'utf8').split('\n')
    .map(l => l.replace(/#.*/, '').trim()).filter(l => /^Listen\b/i.test(l))
ttrue(listens.length > 0)
for (let line of listens) {
    let loopback = /^Listen\s+(127\.0\.0\.1|\[::1\]|localhost):\d+$/i.test(line)
    if (!loopback) {
        console.log(`src/server/install.conf listens beyond loopback: ${line}`)
    }
    ttrue(loopback)
}

//  Each commented upload example requires TLS
for (let name of ['appweb.conf', 'sample.conf']) {
    let text = readFileSync(resolve(SERVER, name), 'utf8')
    let block = text.match(/^#\s*<Route \^\/upload\/>[\s\S]*?^#\s*<\/Route>/m)
    ttrue(block != null)
    let secure = block != null && /^#\s*Require\s+secure\b/m.test(block[0])
    if (!secure) {
        console.log(`src/server/${name}: the upload example lacks Require secure`)
    }
    ttrue(secure)
}
