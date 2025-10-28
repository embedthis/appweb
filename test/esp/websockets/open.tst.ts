/*
    open.tst.ts - ESP WebSocket open test
    Verifies that ESP WebSocket connections open successfully
 */

import {ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/open"
const TIMEOUT = 5000

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

let opened = false
ws.onopen = function (event) {
    opened = true
}
await ws.wait(WebSocket.OPEN, TIMEOUT)
ttrue(opened)
ttrue(ws.readyState == WebSocket.OPEN)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)
