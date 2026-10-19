/*
    whitespace.tst.ts - White space around the request line tokens
 */

import {ttrue, tget} from '@embedthis/testme'
import {ByteArray, Socket, Uri} from '@embedthis/ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

async function request(line: string): Promise<string> {
    let s = new Socket
    let response = new ByteArray
    let n
    s.connect(HTTP.address)
    await s.write(line + "\r\n\r\n")
    for (; (n = await s.read(response, -1)) != null; ) { }
    s.close()
    return response.toString()
}

let text = await request("GET /index.html HTTP/1.0")
ttrue(text.contains('200 OK'))
ttrue(text.contains('Hello /index'))

for (let line of [" GET /index.html HTTP/1.0", "GET         /index.html HTTP/1.0", "GET /index.html      HTTP/1.0"]) {
    text = await request(line)
    ttrue(text.contains('400 Bad Request'), line)
    ttrue(!text.contains('Hello /index'))
}
