/*
    cookie-header.tst.ts - Degenerate Cookie headers on a route that reads the session
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

const PATH = '/auth/basic/joshua/user.html'
const CREDENTIALS = 'Authorization: Basic ' + btoa('joshua:pass1') + '\r\n'

function get(cookie: string, extra = ''): string {
    return `GET ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nCookie: ${cookie}\r\n${extra}Connection: close\r\n\r\n`
}

async function expect(name: string, request: string, status: string, marker: string): Promise<void> {
    let reply = await send(request, marker, true)
    if (!reply.text.includes(status) || !reply.decoded.includes(marker)) {
        console.log(name + ' expected "' + status + '" with "' + marker + '" but got:\n' + reply.text)
    }
    ttrue(reply.text.includes(status))
    ttrue(reply.decoded.includes(marker))
}

for (let cookie of [';', ';;;', '; ; ;', ' ', '=', ';=;']) {
    await expect('Cookie "' + cookie + '" unauthenticated', get(cookie), '401 Unauthorized', 'WWW-Authenticate')
    await expect('Cookie "' + cookie + '" authenticated', get(cookie, CREDENTIALS), '200 OK', 'Welcome to Basic')
}

await expect('well formed', get('a=1; b=2', CREDENTIALS), '200 OK', 'Welcome to Basic')
