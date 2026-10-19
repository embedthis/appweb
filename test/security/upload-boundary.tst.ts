/*
    upload-boundary.tst.ts - The multipart boundary parameter is validated
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

const UPLOAD = '/upload/cgiProgram.cgi?SWITCHES=-e+-p'

function multipart(boundary: string): string {
    return [
        '--' + boundary,
        'Content-Disposition: form-data; name="a"',
        '',
        '1',
        '--' + boundary + '--',
        '',
    ].join('\r\n')
}

async function post(contentType: string, body: string, status: string, marker: string): Promise<void> {
    let request = [
        'POST ' + UPLOAD + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: ' + contentType,
        'Content-Length: ' + body.length,
        '',
        body,
    ].join('\r\n')
    let reply = await send(request, marker, true)
    if (!reply.text.includes(status) || !reply.decoded.includes(marker)) {
        console.log(contentType + ' expected ' + status + ' with "' + marker + '" but got:\n' + reply.text)
    }
    ttrue(reply.text.includes(status))
    ttrue(reply.decoded.includes(marker))
}

const long = 'b'.repeat(70)
const browser = '----WebKitFormBoundary7MA4YWxkTrZu0gW'

for (let [type, boundary] of [
    ['multipart/form-data; boundary=' + browser, browser],
    ['multipart/form-data; boundary="' + browser + '"', browser],
    ['multipart/form-data; boundary=' + long, long],
    ['multipart/form-data; boundary=' + browser + '; charset=utf-8', browser],
    ["multipart/form-data; boundary=a'()+_,-./:=?b", "a'()+_,-./:=?b"],
]) {
    await post(type, multipart(boundary), '200 OK', 'CGI_A=1')
}

for (let type of [
    'multipart/form-data; boundary=',
    'multipart/form-data; boundary=""',
    'multipart/form-data; boundary=" "',
    'multipart/form-data; boundary=bad*char',
    'multipart/form-data; boundary=trailing space',
    'multipart/form-data; boundary=a"b',
]) {
    await post(type, multipart('--'), '400 Bad Request', '400')
}
