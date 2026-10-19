/*
    http2-content-length.tst.ts - The HTTP/2 content-length field is parsed against its grammar
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, withServer} from './server'
import {PROTOCOL_ERROR, literal, requestBlock, sendH2} from './h2'

const PORT = 4532

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('http2-content-length', PORT, [], async () => {
        let authority = `127.0.0.1:${PORT}`

        for (let value of ['abc', '12abc', '-1', ' 5', '5 ', '', '99999999999999999999999']) {
            let result = await sendH2(PORT, requestBlock('/index.html', authority, [literal('content-length', value)]))
            if (result.goaway != PROTOCOL_ERROR && result.reset != PROTOCOL_ERROR) {
                console.log('content-length "' + value + '" expected PROTOCOL_ERROR but got ' + JSON.stringify(result))
            }
            ttrue(result.goaway == PROTOCOL_ERROR || result.reset == PROTOCOL_ERROR)
        }

        let duplicate = await sendH2(PORT, requestBlock('/index.html', authority,
            [literal('content-length', '0'), literal('content-length', '0')]))
        ttrue(duplicate.goaway == PROTOCOL_ERROR || duplicate.reset == PROTOCOL_ERROR)

        let ok = await sendH2(PORT, requestBlock('/index.html', authority, [literal('content-length', '0')]))
        teq(ok.goaway, 0)
        ttrue(ok.data.includes('Hello /index.html'))
    })
}
