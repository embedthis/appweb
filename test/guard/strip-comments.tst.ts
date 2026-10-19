/*
    strip-comments.tst.ts - The release document comment stripper removes comments token-wise
 */

import {ttrue} from '@embedthis/testme'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

const SCRIPT = resolve(import.meta.dir, '../../bin/stripComments.sh')

function strip(input: string) {
    let result = spawnSync('bash', [SCRIPT], {input, encoding: 'utf8'})
    return {status: result.status, out: result.stdout, err: result.stderr}
}

let result = strip('A\n<!-- reviewer: check -->\nKEEP1\nB <!-- inline --> KEEP2\n<!--\nmulti\nline\n-->\nKEEP3\n')
ttrue(result.status == 0)
ttrue(result.out.includes('KEEP1'))
ttrue(result.out.includes('KEEP2'))
ttrue(result.out.includes('KEEP3'))
ttrue(!result.out.includes('<!--'))
ttrue(!result.out.includes('reviewer'))
ttrue(!result.out.includes('multi'))

let plain = '# Title\n\nText with an arrow ->\n'
result = strip(plain)
ttrue(result.status == 0)
ttrue(result.out == plain)

result = strip('before\n<!-- never closed\nKEEP\n')
ttrue(result.status != 0)
ttrue(result.err.includes('unbalanced'))
