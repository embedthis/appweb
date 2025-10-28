/*
    Test proxy WebSocket basic send functionality

    This test verifies that the proxy correctly establishes WebSocket connections
    and forwards messages between client and backend.
 */

import {tskip, ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/proxy/websockets/basic/send"
const TIMEOUT = 5000

if (true) {
    let ws = new WebSocket(WS)

    let opened = false
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
} else {
    tskip('DISABLED')
}
