/*
    form-param-count.tst - Request parameter count limit

    Many tiny form fields must be capped independently of the byte-size request limits.
 */

import {HOST, accept, reject} from './raw'

const LIMIT = 512
const BOUNDARY = '----appweb-param-count'

function urlencoded(count: number): string {
    let parts: string[] = ['a=ok']
    for (let i = 1; i < count; i++) {
        parts.push('p' + i + '=1')
    }
    return parts.join('&')
}

function multipart(count: number): string {
    let parts: string[] = []
    for (let i = 0; i < count; i++) {
        parts.push(
            '--' + BOUNDARY,
            'Content-Disposition: form-data; name="p' + i + '"',
            '',
            '1')
    }
    parts.push('--' + BOUNDARY + '--', '')
    return parts.join('\r\n')
}

function request(path: string, contentType: string, body: string, headers: string[] = []): string {
    let lines = [
        'POST ' + path + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: ' + contentType,
        'Content-Length: ' + body.length,
    ]
    for (let header of headers) {
        lines.push(header)
    }
    lines.push(
        '',
        body)
    return lines.join('\r\n')
}

let body = urlencoded(LIMIT)
await accept('urlencoded exact limit',
    request('/post', 'application/x-www-form-urlencoded', body),
    'a=[ok]')

body = urlencoded(LIMIT + 1)
await reject('urlencoded over limit',
    request('/post', 'application/x-www-form-urlencoded', body),
    '413 Request Entity Too Large')

body = multipart(LIMIT)
await accept('multipart exact limit',
    request('/upload/cgiProgram.cgi', 'multipart/form-data; boundary=' + BOUNDARY, body, ['switches: -e -p']),
    'PVAR p511=1')

body = multipart(LIMIT + 1)
await reject('multipart over limit',
    request('/upload/cgiProgram.cgi', 'multipart/form-data; boundary=' + BOUNDARY, body, ['switches: -e -p']),
    '413 Request Entity Too Large')
