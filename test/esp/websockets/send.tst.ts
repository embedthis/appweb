/*
    send.tst.ts - ESP WebSocket send test
    Verifies that ESP WebSocket can send messages successfully
 */

import {ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/send"
const TIMEOUT = 5000

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

let opened
ws.onopen = function (event) {
    opened = true
    ws.send("Hello World")
}

await ws.wait(WebSocket.OPEN, TIMEOUT)
ttrue(opened)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)
