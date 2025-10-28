/*
    len-150.tst.ts - ESP WebSocket length encoding test (150 bytes)
    Verifies that ESP WebSocket handles messages requiring multi-byte length encoding
 */

import {ttrue, tget} from 'testme'
import {WebSocket, deserialize} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/len"
const TIMEOUT = 5000
const LEN = 150

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
let msg = "0123456789".times(LEN / 10)
ttrue(msg.length >= 126)
ws.send(msg)

await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)

let info = deserialize(response)
ttrue(info.type == 1)
ttrue(info.last == 1)
ttrue(info.length == LEN)
ttrue(info.data == "0123456789")
