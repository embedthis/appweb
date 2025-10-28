/*
    len-256K.tst.ts - ESP WebSocket length encoding test (256K bytes)
    Verifies that ESP WebSocket handles very large messages with binary data
 */

import {ttrue, tget} from 'testme'
import {ByteArray, WebSocket, deserialize} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/len"
const TIMEOUT = 5000 * 1000
const LEN = 256 * 1024

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

let response
ws.onmessage = function (event) {
    ttrue(typeof event.data === "string")
    response = event.data
    ws.close()
}

await ws.wait(WebSocket.OPEN, TIMEOUT)

let data = new ByteArray(Math.ceil(LEN / 50) * 50)
for (let i = 0; i < LEN / 50; i++) {
    data.write("01234567890123456789012345678901234567890123456789")
}
ws.send(data)

await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)

let info = deserialize(response)
ttrue(info.type == 2)
ttrue(info.last == 1)
ttrue(info.length == data.length)
