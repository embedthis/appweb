/*
    plus-path.tst.ts - A "+" in the request path is a literal character, not a space
 */

import {ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

async function status(path: string): Promise<string> {
    let request = ['GET ' + path + ' HTTP/1.1', 'Host: ' + HOST, 'Connection: close', '', ''].join('\r\n')
    let reply = await send(request, 'HTTP/1.1 ', true)
    return reply.text.split('\r\n')[0]
}

function expect(path: string, line: string, code: string): void {
    if (!line.includes(code)) {
        console.log(path + ': expected ' + code + ' but got ' + line)
    }
    ttrue(line.includes(code))
}

expect('/My%20Documents/index.html', await status('/My%20Documents/index.html'), '200 OK')
expect('/My+Documents/index.html', await status('/My+Documents/index.html'), '404 Not Found')
expect('/My%2BDocuments/index.html', await status('/My%2BDocuments/index.html'), '404 Not Found')

let request = ['GET /cgiProgram.cgi?switches=-e+-p HTTP/1.1', 'Host: ' + HOST, 'Connection: close', '', ''].join('\r\n')
let reply = await send(request, 'HTTP/1.1 ', true)
ttrue(reply.text.includes('200 OK'))
ttrue(reply.decoded.includes('QUERY_STRING=switches=-e+-p'))
ttrue(reply.decoded.includes('CGI_SWITCHES=-e -p'))
