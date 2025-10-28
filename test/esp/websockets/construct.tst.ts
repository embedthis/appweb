/*
    construct.tst.ts - ESP WebSocket constructor test
    Verifies that ESP WebSocket objects can be created and initialized
 */

import {ttrue, tget} from 'testme'
import {WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/construct"
const TIMEOUT = 5000

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED || ws.readyState == WebSocket.CLOSING)
