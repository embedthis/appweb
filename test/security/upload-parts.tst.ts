/*
    upload-parts.tst.ts - LimitUploadParts bounds the number of parts in one multipart request
 */

import {ttrue} from '@embedthis/testme'
import net from 'node:net'
import {withServer} from './server'

const PORT = 4545
const CGI = '/cgiProgram.cgi?switches=-e%20-p'
const LIMIT = 4

function multipart(parts: number): string {
    let lines: string[] = []
    for (let i = 1; i <= parts; i++) {
        lines.push('--BOUNDARY', 'Content-Disposition: form-data; name="f' + i + '"', '', 'v' + i)
    }
    lines.push('--BOUNDARY--', '')
    return lines.join('\r\n')
}

async function post(body: string): Promise<string> {
    let request = [
        'POST ' + CGI + ' HTTP/1.1',
        'Host: 127.0.0.1:' + PORT,
        'Connection: close',
        'Content-Type: multipart/form-data; boundary=BOUNDARY',
        'Content-Length: ' + body.length,
        '',
        body,
    ].join('\r\n')
    return await new Promise<string>(resolvePromise => {
        let socket = net.connect(PORT, '127.0.0.1')
        let text = ''
        let timer = setTimeout(() => socket.destroy(), 10000)
        socket.on('connect', () => socket.write(request))
        socket.on('data', chunk => (text += chunk.toString()))
        socket.on('close', () => {
            clearTimeout(timer)
            resolvePromise(text)
        })
        socket.on('error', () => {})
    })
}

function check(name: string, text: string, status: string, marker: string): void {
    if (!text.includes(status) || !text.includes(marker)) {
        console.log(name + ': expected ' + status + ' with "' + marker + '" but got:\n' + text)
    }
    ttrue(text.includes(status))
    ttrue(text.includes(marker))
}

await withServer('upload-parts', PORT, [
    'AddHandler cgiHandler cgi',
    'CgiPrefix "CGI_"',
    'AddFilter uploadFilter',
    'LimitUploadParts ' + LIMIT,
], async () => {
    let atLimit = await post(multipart(LIMIT))
    check('at the limit', atLimit, '200 OK', 'CGI_F' + LIMIT + '=v' + LIMIT)

    check('one over the limit', await post(multipart(LIMIT + 1)), '413 Request Entity Too Large', 'Access Error: 413')

    check('far over the limit', await post(multipart(1000)), '413 Request Entity Too Large', 'Access Error: 413')
})
