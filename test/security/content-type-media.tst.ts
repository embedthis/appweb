/*
    content-type-media.tst.ts - The body parser is chosen by the media type, not by a substring of the header
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

const CGI = '/cgiProgram.cgi?SWITCHES=-e+-p'

function check(response: string, text: string, want: boolean): void {
    if (response.includes(text) != want) {
        console.log((want ? 'Missing "' : 'Unexpected "') + text + '" in response:\n' + response)
    }
    ttrue(response.includes(text) == want)
}

async function post(contentType: string, body: string): Promise<string> {
    let request = [
        'POST ' + CGI + ' HTTP/1.1',
        'Host: ' + HOST,
        'Connection: close',
        'Content-Type: ' + contentType,
        'Content-Length: ' + body.length,
        '',
        body,
    ].join('\r\n')
    let reply = await send(request, '</HTML>', true)
    check(reply.decoded, '200 OK', true)
    return reply.decoded
}

/*
    CGI_ variables reflect the server parser; PVAR reflects the CGI program's parser.
 */

for (let type of ['application/x-www-form-urlencoded', 'application/x-www-form-urlencoded; charset=utf-8']) {
    let body = await post(type, 'a=1&b=2')
    check(body, 'CGI_A=1', true)
    check(body, 'CGI_B=2', true)
}

for (let type of ['text/plain; charset=application/x-www-form-urlencoded', 'application/x-www-form-urlencoded-v2',
                  'text/plain']) {
    let body = await post(type, 'a=1&b=2')
    check(body, 'CGI_A=1', false)
    check(body, 'CGI_B=2', false)
}
