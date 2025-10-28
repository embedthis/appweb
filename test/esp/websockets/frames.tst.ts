/*
    frames.tst.ts - ESP WebSocket multi-frame test
    Verifies that ESP WebSocket can receive messages frame by frame
 */

import {ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/frames"
const TIMEOUT = 5000 * 1000

let ws = new WebSocket(WS, null, {frames: true})
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

let received = 0, gotClose, gotError, msgCount = 0, lastEvent

ws.onmessage = function (event) {
    ttrue(typeof event.data === "string")
    ttrue(event.data.length == 16)
    received += event.data.length
    msgCount++
    lastEvent = event
}

ws.onclose = function (event) {
    gotClose = true
    ws.close()
}
ws.onerror = function (event) {
}

await ws.wait(WebSocket.OPEN, TIMEOUT)

await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)

ttrue(received == 16000)
ttrue(gotClose)
ttrue(msgCount > 1)
ttrue(lastEvent.last == true)
ttrue(!gotError)
