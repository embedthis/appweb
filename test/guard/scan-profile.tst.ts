/*
    scan-profile.tst.ts - The sec-scan profile compiles the features the build ships
 */

import {tskip, ttrue} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const ROOT = resolve(import.meta.dir, '../..')
const PROFILE = resolve(ROOT, 'sec-scan.json5')

if (!existsSync(PROFILE)) {
    tskip('no sec-scan.json5 in this tree')
    process.exit(0)
}

let premake = readFileSync(resolve(ROOT, 'projects/premake5.lua'), 'utf8')
let features = [...premake.matchAll(/define = "(ME_[A-Z0-9_]+)"/g)].map(m => m[1])
ttrue(features.length > 0, 'no feature table in projects/premake5.lua')

let profile = readFileSync(PROFILE, 'utf8')
let block = (/analyzerDefines:\s*\[([^\]]*)\]/.exec(profile) || ['', ''])[1]
let defines = [...block.matchAll(/'([^']*)'/g)].map(m => m[1])
ttrue(defines.length > 0, 'no analyzerDefines in sec-scan.json5')

for (let feature of features) {
    let ok = defines.includes(`${feature}=1`)
    if (!ok) {
        console.log(`sec-scan.json5 analyzerDefines lacks ${feature}=1, which the release build sets`)
    }
    ttrue(ok)
}
