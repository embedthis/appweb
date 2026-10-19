/*
    range-boundary.tst.ts - The multipart/byteranges boundary is random
 */

import {teq, ttrue, tskip} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, withServer} from './server'

const PORT = 4571

async function boundary(): Promise<string> {
    let response = await fetch(`http://127.0.0.1:${PORT}/10K.txt`, {headers: {Range: 'bytes=0-9,100-109'}})
    teq(response.status, 206)
    await response.text()
    let type = response.headers.get('content-type') || ''
    ttrue(type.startsWith('multipart/byteranges'))
    return (type.match(/boundary=([^;\s]+)/) || ['', ''])[1]
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('range-boundary', PORT, [], async () => {
        let seen = new Set<string>()
        for (let i = 0; i < 4; i++) {
            let value = await boundary()
            if (!/^[0-9a-f]{32}$/.test(value)) {
                console.log('boundary is not 32 random hex digits: ' + value)
            }
            ttrue(/^[0-9a-f]{32}$/.test(value))
            seen.add(value)
        }
        teq(seen.size, 4)
    })
}
