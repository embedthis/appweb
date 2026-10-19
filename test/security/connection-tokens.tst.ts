/*
    connection-tokens.tst.ts - Connection is a token list
 */

import {teq, ttrue} from '@embedthis/testme'
import {HOST, send} from './raw'

const CGI = '/cgiProgram.cgi?SWITCHES=-e+-p'

function get(path: string, headers: string): string {
    return `GET ${path} HTTP/1.1\r\nHost: ${HOST}\r\n${headers}\r\n`
}

function header(text: string, name: string): string | null {
    let head = text.split('\r\n\r\n')[0]
    for (let line of head.split('\r\n')) {
        let colon = line.indexOf(':')
        if (colon > 0 && line.slice(0, colon).trim().toLowerCase() == name) {
            return line.slice(colon + 1).trim()
        }
    }
    return null
}

for (let value of ['close', 'Close', 'close, TE', 'TE, close', 'close, keep-alive', 'keep-alive, close', ' close ',
                   'keep-alive,close']) {
    let reply = await send(get('/index.html', `Connection: ${value}\r\n`), 'Hello /index.html', true)
    if (!reply.closed || !/close/i.test(header(reply.text, 'connection') || '')) {
        console.log('Connection: ' + value + ' got ' + header(reply.text, 'connection') + ' closed=' + reply.closed)
    }
    ttrue(reply.text.includes('200 OK'))
    ttrue(/close/i.test(header(reply.text, 'connection') || ''))
    ttrue(reply.closed)
}

for (let value of ['keep-alive', 'keep-alive, Upgrade', 'TE', 'X-Secret']) {
    let reply = await send(get('/index.html', `Connection: ${value}\r\n`), 'Hello /index.html')
    ttrue(reply.text.includes('200 OK'))
    ttrue(/keep-alive/i.test(header(reply.text, 'connection') || ''))
    ttrue(!reply.closed)
}

let reply = await send(get(CGI, 'Connection: X-Secret, close\r\nX-Secret: leak\r\nX-Public: shown\r\n'), '</HTML>', true)
ttrue(reply.decoded.includes('200 OK'))
ttrue(reply.decoded.includes('HTTP_X_PUBLIC=shown'))
if (reply.decoded.includes('HTTP_X_SECRET')) {
    console.log('hop-by-hop header reached the CGI environment:\n' + reply.decoded)
}
ttrue(!reply.decoded.includes('HTTP_X_SECRET'))
