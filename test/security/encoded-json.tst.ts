/*
    encoded-json.tst.ts - The _encoded_json_ marker is a parameter name, not a substring
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

const CGI = '/cgiProgram.cgi?SWITCHES=-e+-p'

function check(text: string, needle: string, want: boolean): void {
    if (text.includes(needle) != want) {
        console.log((want ? 'Missing "' : 'Unexpected "') + needle + '" in:\n' + text)
    }
    ttrue(text.includes(needle) == want)
}

async function get(query: string): Promise<string> {
    let reply = await send(`GET /cgiProgram.cgi?${query} HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`, '</HTML>', true)
    return reply.decoded
}

async function post(body: string): Promise<string> {
    let request = [
        'POST ' + CGI + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: application/x-www-form-urlencoded',
        'Content-Length: ' + body.length,
        '',
        body,
    ].join('\r\n')
    return (await send(request, 'HTTP/1.', true)).decoded
}

let text = await get('SWITCHES=-e+-p&a=1&b=_encoded_json_')
check(text, '200 OK', true)
check(text, 'CGI_A=1', true)
check(text, 'CGI_B=_encoded_json_', true)

text = await get('SWITCHES=-e+-p&a=x_encoded_json_y&b=2')
check(text, 'CGI_A=x_encoded_json_y', true)
check(text, 'CGI_B=2', true)

text = await get('_encoded_json_=%7B%22SWITCHES%22%3A%22-e%20-p%22%2C%22a%22%3A%221%22%7D')
check(text, '200 OK', true)
check(text, 'CGI_A=1', true)

text = await post('_encoded_json_=%7B%22a%22%3A')
check(text, '400 Bad Request', true)

text = await post('a=1&note=see_encoded_json_here')
check(text, '200 OK', true)
check(text, 'CGI_A=1', true)
check(text, 'CGI_NOTE=see_encoded_json_here', true)
