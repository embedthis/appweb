/*
    hpack-varint.tst.ts - HPACK integer length bound
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync} from 'node:fs'
import {BIN, withServer} from './server'
import {PROTOCOL_ERROR, literalIndexedName, requestBlock, sendH2} from './h2'

const PORT = 4524

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await withServer('hpack-varint', PORT, [], async () => {
        //  Indexed field whose fifth continuation byte carries bits above the 32 bit boundary
        let overflow = await sendH2(PORT, Buffer.from([0xff, 0xe1, 0xe1, 0xe1, 0xe1, 0x61]))
        if (overflow.goaway != PROTOCOL_ERROR && overflow.reset != PROTOCOL_ERROR) {
            console.log('overflowing integer expected PROTOCOL_ERROR but got ' + JSON.stringify(overflow))
        }
        ttrue(overflow.goaway == PROTOCOL_ERROR || overflow.reset == PROTOCOL_ERROR)

        //  Six continuation bytes: a shift of 35 whatever they carry
        let overlong = await sendH2(PORT, Buffer.from([0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00]))
        if (overlong.goaway != PROTOCOL_ERROR && overlong.reset != PROTOCOL_ERROR) {
            console.log('six byte integer expected PROTOCOL_ERROR but got ' + JSON.stringify(overlong))
        }
        ttrue(overlong.goaway == PROTOCOL_ERROR || overlong.reset == PROTOCOL_ERROR)

        //  The longest legal form: a 128 octet value whose length uses the prefix and five continuation bytes
        let block = requestBlock('/index.html', `127.0.0.1:${PORT}`, [
            literalIndexedName(58, 'a'.repeat(128), 5),      // user-agent, static index 58
        ])
        let legal = await sendH2(PORT, block)
        if (!legal.data.includes('Hello /index.html')) {
            console.log('five byte integer expected a response but got ' + JSON.stringify(legal))
        }
        teq(legal.goaway, 0)
        ttrue(legal.data.includes('Hello /index.html'))
    })
}
