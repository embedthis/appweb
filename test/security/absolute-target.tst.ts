/*
    absolute-target.tst.ts - An absolute-form request target supplies the authority
 */

import {teq, ttrue} from '@embedthis/testme'
import {tget} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

const NAMED = new Uri(tget('TM_NAMED') || 'http://localhost:4200')
const PORT = NAMED.port || 4200

async function request(text: string): Promise<string> {
    let s = new Socket
    let response = new ByteArray(65536)
    s.connect(NAMED.address)
    try {
        await s.write(text)
        for (let i = 0; i < 20; i++) {
            if ((await s.read(response, -1)) == null) {
                break
            }
        }
    } catch {
    }
    s.close()
    return response.toString()
}

function status(text: string): string {
    return text.split('\r\n')[0]
}

let byHost = await request(`GET /vhost1.html HTTP/1.1\r\nHost: localhost:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(byHost).includes('200'), status(byHost))
let otherHost = await request(`GET /vhost1.html HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(otherHost).includes('404'), status(otherHost))

let absolute = await request(`GET http://localhost:${PORT}/vhost1.html HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(absolute).includes('200'), 'absolute-form over a disagreeing Host: ' + status(absolute))

let reverse = await request(`GET http://127.0.0.1:${PORT}/vhost1.html HTTP/1.1\r\nHost: localhost:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(reverse).includes('404'), 'absolute-form 127.0.0.1 over Host localhost: ' + status(reverse))

for (let headers of [`Host: localhost:${PORT}\r\n`, '', `Host: localhost:${PORT}\r\n`]) {
    let r = await request(`GET http://localhost:${PORT}/vhost1.html HTTP/1.1\r\n${headers}Connection: close\r\n\r\n`)
    ttrue(status(r).includes('200'), status(r))
}
let noPort = await request(`GET http://localhost/vhost1.html HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(noPort).includes('200'), 'port-less authority: ' + status(noPort))

let userinfo = await request(`GET http://user@localhost:${PORT}/vhost1.html HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`)
ttrue(status(userinfo).includes('200'), 'authority with userinfo: ' + status(userinfo))
