/*
    range-limit.tst.ts - The number of ranges is bounded and their order is checked on resolved offsets
 */

import {teq, ttrue} from '@embedthis/testme'
import {mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from '../security/server'
import {body, exchange, status} from '../security/wire'

const PORT = 4563
const NAME = 'range-limit'
const TEN = '0123456789'

async function range(spec: string) {
    return await exchange(PORT, `GET /ten.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=${spec}\r\n` +
        'Connection: close\r\n\r\n', 5000)
}

function expect(spec: string, reply: any, code: string): void {
    if (!status(reply).includes(code)) {
        console.log(`bytes=${spec}: expected ${code}, got "${status(reply)}"`)
    }
    ttrue(status(reply).includes(code))
}

function list(count: number): string {
    return Array.from({length: count}, (_, i) => `${i}-${i}`).join(',')
}

let docs = resolve(workDir(NAME), 'docs')

await withServer(NAME, PORT, [`Documents ${docs}`], async () => {
    mkdirSync(docs, {recursive: true})
    writeFileSync(resolve(docs, 'ten.txt'), TEN)
    writeFileSync(resolve(docs, 'long.txt'), 'x'.repeat(100))

    let at = await exchange(PORT, `GET /long.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=${list(16)}\r\n` +
        'Connection: close\r\n\r\n', 5000)
    expect('16 ranges', at, '206 Partial Content')
    teq((body(at).match(/Content-Range: bytes \d+-\d+\/100/g) || []).length, 16)

    let over = await exchange(PORT, `GET /long.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=${list(17)}\r\n` +
        'Connection: close\r\n\r\n', 5000)
    expect('17 ranges', over, '416')

    expect('5-9,-8', await range('5-9,-8'), '416')
    expect('0-9,-100', await range('0-9,-100'), '416')
    expect('0-4,3-6', await range('0-4,3-6'), '416')

    let ok = await range('0-1,-3')
    expect('0-1,-3', ok, '206 Partial Content')
    ttrue(body(ok).includes('Content-Range: bytes 0-1/10'))
    ttrue(body(ok).includes('Content-Range: bytes 7-9/10'))

    let single = await range('2-4')
    expect('2-4', single, '206 Partial Content')
    teq(body(single), '234')
})

await withServer(NAME + '-conf', PORT + 1, [`Documents ${docs}`, 'LimitRanges 2'], async () => {
    mkdirSync(docs, {recursive: true})
    writeFileSync(resolve(docs, 'ten.txt'), TEN)
    let two = await exchange(PORT + 1, 'GET /ten.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=0-0,2-2\r\n' +
        'Connection: close\r\n\r\n', 5000)
    ttrue(status(two).includes('206'))
    let three = await exchange(PORT + 1, 'GET /ten.txt HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=0-0,2-2,4-4\r\n' +
        'Connection: close\r\n\r\n', 5000)
    ttrue(status(three).includes('416'))
})
