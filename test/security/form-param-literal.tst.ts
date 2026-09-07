/*
    form-param-literal.tst - Network-supplied form names are literal parameter keys

    Multipart and urlencoded names can contain MPR JSON query metacharacters. They must be stored
    as literal request parameters, not evaluated as query expressions against rx->params.
 */

import {ttrue} from '@embedthis/testme'

import {HOST, send} from './raw'

const CGI = '/cgiProgram.cgi?-e+-p'
const UPLOAD_CGI = '/upload/cgiProgram.cgi?-e+-p'

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

function request(path: string, contentType: string, body: string): string {
    return [
        'POST ' + path + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: ' + contentType,
        'Content-Length: ' + body.length,
        '',
        body,
    ].join('\r\n')
}

async function post(path: string, contentType: string, body: string): Promise<string> {
    let reply = await send(request(path, contentType, body), '</HTML>', true)
    check(reply.decoded, '200 OK')
    return reply.decoded
}

const boundary = '----literal-param-boundary'
const multipart = [
    '--' + boundary,
    'Content-Disposition: form-data; name="a"',
    '',
    '1',
    '--' + boundary,
    'Content-Disposition: form-data; name="b"',
    '',
    '2',
    '--' + boundary,
    'Content-Disposition: form-data; name="c"',
    '',
    '3',
    '--' + boundary,
    'Content-Disposition: form-data; name="*"',
    '',
    'attack',
    '--' + boundary,
    'Content-Disposition: form-data; name="a.b"',
    '',
    'dot',
    '--' + boundary,
    'Content-Disposition: form-data; name=""',
    '',
    'empty-name',
    '--' + boundary,
    'Content-Disposition: form-data; name="x.y[*]"; filename="literal.txt"',
    'Content-Type: text/plain',
    '',
    'file-body',
    '--' + boundary + '--',
    '',
].join('\r\n')

let body = await post(UPLOAD_CGI, 'multipart/form-data; boundary=' + boundary, multipart)
check(body, 'CGI_A=1')
check(body, 'CGI_B=2')
check(body, 'CGI_C=3')
check(body, 'CGI_\\*=attack')
check(body, 'CGI_A.B=dot')
check(body, 'CGI_FILE_CLIENT_FILENAME_X.Y\\[\\*\\]=literal.txt')
check(body, 'PVAR a=1')
check(body, 'PVAR b=2')
check(body, 'PVAR c=3')
check(body, 'PVAR *=attack')
check(body, 'PVAR a.b=dot')
reject(body, 'CGI_A=attack')
reject(body, 'CGI_B=attack')
reject(body, 'CGI_C=attack')
reject(body, 'CGI_=empty-name')
reject(body, 'PVAR =empty-name')

body = await post(CGI, 'application/x-www-form-urlencoded',
    'a.b=first&a.b=second&a=1&b=2&c=3&*=attack&=empty-name')
check(body, 'CGI_A=1')
check(body, 'CGI_B=2')
check(body, 'CGI_C=3')
check(body, 'CGI_A.B=first second')
check(body, 'CGI_*=attack')
check(body, 'PVAR a.b=second')
check(body, 'PVAR *=attack')
reject(body, 'CGI_A.B=second')
reject(body, 'CGI_=empty-name')
