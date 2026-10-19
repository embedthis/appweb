/*
    authpass-rounds.tst.ts - authpass --rounds sets the Blowfish work factor written into the hash
 */

import {ttrue} from '@embedthis/testme'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

const AUTHPASS = resolve(import.meta.dir, '../../build/bin', process.platform == 'win32' ? 'authpass.exe' : 'authpass')

function authpass(...args: string[]) {
    let result = spawnSync(AUTHPASS, [...args, '--password', 'pass1', 'example.com', 'joshua', 'user'], {
        encoding: 'utf8',
    })
    return {status: result.status, out: result.stdout.trim()}
}

let result = authpass('--rounds', '2000')
ttrue(result.status == 0)
ttrue(/^BF2:02000:[^:]+:[^:]+$/.test(result.out), `unexpected hash ${result.out}`)

result = authpass()
ttrue(result.status == 0)
ttrue(/^BF2:\d{5,}:/.test(result.out), `unexpected hash ${result.out}`)

for (let bad of ['0', '-5', 'abc', '99999999999']) {
    ttrue(authpass('--rounds', bad).status != 0, `--rounds ${bad} was accepted`)
}
