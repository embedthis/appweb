/*
    underscore-headers.tst.ts - A request header spelled with underscores must not reach a FastCGI application
 */

import {teq, ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

for (let headers of [['X-Forwarded-For: good', 'X_Forwarded_For: evil'],
                     ['X_Forwarded_For: evil', 'X-Forwarded-For: good']]) {
    let args = ['curl', '-s', '-o', '-', '-w', '\n%{http_code}']
    for (let header of [...headers, 'X_Only: underscore']) {
        args.push('-H', header)
    }
    args.push(HTTP + '/fast-bin/fastProgram')
    let lines = Bun.spawnSync(args, {stdout: 'pipe', stderr: 'pipe'}).stdout.toString().split('\n')
    teq(lines.pop(), '200')
    let body = lines.join('\n')

    ttrue(/HTTP_X.Forwarded.For=good/i.test(body), `hyphen spelling lost with ${headers.join(', ')}`)
    ttrue(!body.includes('=evil'), `underscore spelling reached the application with ${headers.join(', ')}`)
    ttrue(!/HTTP_X.Only/i.test(body), 'an underscore-only header reached the application')
}
