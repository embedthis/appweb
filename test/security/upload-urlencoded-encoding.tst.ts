/*
    upload-urlencoded-encoding.tst - Multipart fields are escaped before CGI urlencoded replay
 */

import {ttrue} from '@embedthis/testme'

import {HOST, send} from './raw'

const boundary = '----upload-urlencoded-boundary'
const path = '/upload/cgiProgram.cgi?-e+-p'

function check(response: string, text: string): void {
    if (!response.includes(text)) {
        console.log('Missing "' + text + '" in response:\n' + response)
    }
    ttrue(response.includes(text))
}

function reject(response: string, text: string): void {
    if (response.includes(text)) {
        console.log('Unexpected "' + text + '" in response:\n' + response)
    }
    ttrue(!response.includes(text))
}

function part(name: string, value: string): string {
    return [
        '--' + boundary,
        'Content-Disposition: form-data; name="' + name + '"',
        '',
        value,
    ].join('\r\n')
}

const body = [
    part('user', 'guest&role=admin'),
    part('a=1&admin', 'x'),
    part('round', '100%+ ok'),
    '--' + boundary + '--',
    '',
].join('\r\n')

const request = [
    'POST ' + path + ' HTTP/1.1',
    'Host: ' + HOST,
    'Connection: close',
    'Content-Type: multipart/form-data; boundary=' + boundary,
    'Content-Length: ' + body.length,
    '',
    body,
].join('\r\n')

const reply = await send(request, '</HTML>', true)
check(reply.text, '200 OK')
check(reply.text, 'PVAR user=guest&role=admin')
check(reply.text, 'PVAR a=1&admin=x')
check(reply.text, 'PVAR round=100%+ ok')
reject(reply.text, 'PVAR role=admin')
reject(reply.text, 'PVAR admin=x')
