/*
    chunked-length.tst.ts - A FastCGI app is given CONTENT_LENGTH for a chunked body, and no HTTP_TRANSFER_ENCODING
 */

import {ttrue, tget} from '@embedthis/testme'
import {dechunk} from '../security/raw'
import {exchange} from '../security/wire'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
const PORT = Number(HTTP.replace(/^.*:/, ''))
const BODY = 'name=value&other=12345'

function variable(text: string, name: string): string {
    let match = new RegExp(name + '=([^<\\r\\n]*)').exec(text)
    return match ? match[1] : ''
}

let half = BODY.length >> 1
let reply = await exchange(PORT, `POST /fast-bin/fastProgram HTTP/1.1\r\nHost: 127.0.0.1\r\n` +
    `Content-Type: text/plain\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n` +
    `${half.toString(16)}\r\n${BODY.slice(0, half)}\r\n` +
    `${(BODY.length - half).toString(16)}\r\n${BODY.slice(half)}\r\n0\r\n\r\n`, 10000, "</HTML>")
let text = dechunk(reply.text)
ttrue(text.includes('200'))
ttrue(variable(text, 'CONTENT_LENGTH') == String(BODY.length))
ttrue(text.includes(`Post Data ${BODY.length} bytes found`))
ttrue(!/HTTP_Transfer.Encoding/i.test(text))
