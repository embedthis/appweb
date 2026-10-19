/*
    path-info-encoding.tst.ts - PATH_INFO never carries an escape a CGI program could decode again
 */

import {ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'
import {exchange, status} from '../security/wire'

const PORT = 4587

async function get(path: string): Promise<{code: number, text: string}> {
    let reply = await exchange(PORT, `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    return {code: parseInt(status(reply).split(' ')[1] || '0'), text: reply.text}
}

await withServer('path-info-encoding', PORT, ['AddHandler cgiHandler cgi'], async () => {
    for (let path of ['%252e%252e%252fsecret', '%252fsecret', '%25252e', '%255csecret', '%c0%ae%c0%ae/secret']) {
        let reply = await get(`/cgiProgram.cgi/${path}?switches=-e`)
        if (reply.code != 400) {
            console.log(`${path} answered ${reply.code}`)
        }
        ttrue(reply.code == 400)
    }
    let ok = await get('/cgiProgram.cgi/some/extra/path?switches=-e')
    ttrue(ok.code == 200)
    ttrue(ok.text.includes('PATH_INFO=/some/extra/path'))
})
