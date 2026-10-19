/*
    response-shape.tst.ts - A CGI status line is applied, and headerless output is forwarded untouched
 */

import {teq, ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

async function raw(n: number): Promise<{status: number, body: Uint8Array}> {
    let response = await fetch(HTTP + '/cgi-bin/cgiProgram', {headers: {SWITCHES: '-r ' + n}})
    return {status: response.status, body: new Uint8Array(await response.arrayBuffer())}
}

function text(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes)
}

let r = await raw(1)
teq(r.status, 500)
teq(text(r.body), 'BODY')

r = await raw(2)
teq(r.status, 200)
teq(text(r.body), 'ABCDEFGH\r\n\r\nIJKLMNOP')
ttrue(!r.body.includes(0))

r = await raw(3)
teq(r.status, 502)

r = await raw(4)
teq(r.status, 404)
teq(text(r.body), 'GONE')

r = await raw(5)
teq(r.status, 200)
teq(text(r.body), 'BIN\x01:\x02DATA\r\n\r\nMORE')
