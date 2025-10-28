/*
    len-1500.tst.ts - ESP WebSocket length encoding test (1500 bytes)
    Verifies that ESP WebSocket handles larger single-frame messages
 */

import {ttrue, tget} from 'testme'
import {WebSocket, deserialize} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/len"
const TIMEOUT = 5000 * 1000
const LEN = 1500

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
ws.send(msg)

await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)

let info = deserialize(response)
ttrue(info.type == 1)
ttrue(info.last == 1)
ttrue(info.length == LEN)
ttrue(info.data == "0123456789")
