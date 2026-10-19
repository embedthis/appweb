/*
    underscore-headers.tst.ts - A request header spelled with underscores must not reach a CGI child
 */

import {teq, ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

function get(uri: string, headers: string[]): string {
    let args = ['curl', '-s', '-o', '-', '-w', '\n%{http_code}']
    for (let header of headers) {
        args.push('-H', header)
    }
    args.push(HTTP + uri)
    let output = Bun.spawnSync(args, {stdout: 'pipe', stderr: 'pipe'}).stdout.toString()
    let lines = output.split('\n')
    teq(lines.pop(), '200')
    return lines.join('\n')
}

for (let headers of [['X-Forwarded-For: good', 'X_Forwarded_For: evil'],
                     ['X_Forwarded_For: evil', 'X-Forwarded-For: good']]) {
    let body = get('/cgiProgram.cgi', [...headers, 'X_Only: underscore'])
    ttrue(body.includes('HTTP_X_FORWARDED_FOR=good'), `hyphen spelling lost with ${headers.join(', ')}`)
    ttrue(!body.includes('=evil'), `underscore spelling reached the child with ${headers.join(', ')}`)
    ttrue(!body.includes('HTTP_X_ONLY'), 'an underscore-only header reached the child')
}

{
    let body = get('/cgi/action.act', [])
    ttrue(body.includes('REDIRECT_STATUS=200'), 'an Action-mapped script must see REDIRECT_STATUS')
    ttrue(!body.includes('HTTP_REDIRECT_STATUS'), 'REDIRECT_STATUS must not be exported as a request header')
}
