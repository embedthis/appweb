/*
    cipher-examples.tst.ts - Example cipher lists offer only forward secret suites
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const TOP = resolve(import.meta.dir, '../..')

//  IANA names, as used for MbedTLS: TLS 1.2 ephemeral key exchange, or a TLS 1.3 suite (always ephemeral)
const FORWARD_SECRET = /^TLS_(ECDHE|DHE)_|^TLS_(AES|CHACHA20)_/

for (let file of ['src/server/sample.conf', 'src/server/appweb.conf', 'test/appweb.conf']) {
    for (let line of readFileSync(resolve(TOP, file), 'utf8').split('\n')) {
        let m = /^\s*#?\s*SSLCipherSuite\s+(.*)$/.exec(line)
        if (!m) {
            continue
        }
        let suites = m[1].replace(/"/g, '').split(/[:\s]+/).filter(s => s && !s.startsWith('!'))
        for (let suite of suites.filter(s => s.startsWith('TLS_'))) {
            let ok = FORWARD_SECRET.test(suite) && !/_CBC_SHA$|DES|RC4|MD5|NULL|anon/.test(suite)
            if (!ok) {
                console.log(`${file}: ${suite} is not a forward secret suite`)
            }
            ttrue(ok)
        }
        for (let suite of suites.filter(s => !s.startsWith('TLS_'))) {
            let pfs = /^(ECDHE|DHE|EDH)-/.test(suite) && !/DES|RC4|MD5/.test(suite)
            if (!pfs) {
                console.log(`${file}: ${suite} is not a forward secret suite with strong encryption`)
            }
            ttrue(pfs)
        }
    }
}
