/*
    pipelined.tst.ts - A request pipelined behind a CGI request is not written to the CGI program
 */

import {ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'
import {exchange} from '../security/wire'

const PORT = 4585

await withServer('cgi-pipelined', PORT, ['AddHandler cgiHandler cgi'], async () => {
    let reply = await exchange(PORT, 'GET /cgiProgram.cgi HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n' +
        'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    let first = reply.text.split('\r\n')[0]
    if (!first.startsWith('HTTP/1.1 200')) {
        console.log('first response: ' + reply.text.slice(0, 300))
    }
    ttrue(first.startsWith('HTTP/1.1 200'))
    ttrue(!reply.text.includes('Cannot write body data'))
})
