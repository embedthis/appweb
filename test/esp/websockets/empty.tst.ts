/*
    empty.tst.ts - ESP WebSocket empty message test
    Verifies that ESP WebSocket can handle empty messages
 */

import {ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/empty"
const TIMEOUT = 5000 * 1000

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

let gotMsg, gotClose, gotError
ws.onmessage = function (event) {
    ttrue(typeof event.data === "string")
    ttrue(event.data == "")
    ttrue(event.last === true)
    ttrue(event.type == 1)
    gotMsg = true
}

ws.onclose = function (event) {
    ttrue(gotMsg)
    ws.close()
    gotClose = true
}
ws.onerror = function (event) {
    gotError = true
}

await ws.wait(WebSocket.OPEN, TIMEOUT)
ws.send("Hello")
await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)

ttrue(gotMsg)
ttrue(gotClose)
ttrue(!gotError)
