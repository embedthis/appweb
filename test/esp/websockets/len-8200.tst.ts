/*
    len-8200.tst.ts - ESP WebSocket length encoding test (8200 bytes)
    Verifies that ESP WebSocket handles frames just larger than 8K
 */

import {ttrue, tget} from 'testme'
import {ByteArray, WebSocket, deserialize} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/len"
const TIMEOUT = 5000
const LEN = 8200

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

let data = new ByteArray(LEN)
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
ttrue(info.data == "23456789")
