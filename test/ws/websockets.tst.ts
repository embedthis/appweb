/*
    websockets.tst.ts - A standard client can open and close on the primary endpoint
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {WebSocket} from '@embedthis/ejscript'

const PORT = tget('TM_HTTP_PORT') || '4100'
const WS = 'ws://127.0.0.1:' + PORT + '/ws/echo'
const TIMEOUT = 10000

let ws = new WebSocket(WS)
teq(ws.readyState, WebSocket.CONNECTING)

let opened = false
ws.onopen = function () {
    opened = true
}

await ws.wait(WebSocket.OPEN, TIMEOUT)
ttrue(opened)
teq(ws.readyState, WebSocket.OPEN)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
await ws.wait(WebSocket.CLOSED, TIMEOUT)
teq(ws.readyState, WebSocket.CLOSED)

//  A second connection succeeds after the first closed, so the route is not left wedged
let ws2 = new WebSocket(WS)
let opened2 = false
ws2.onopen = function () {
    opened2 = true
}
await ws2.wait(WebSocket.OPEN, TIMEOUT)
ttrue(opened2)
ws2.close()
await ws2.wait(WebSocket.CLOSED, TIMEOUT)
teq(ws2.readyState, WebSocket.CLOSED)
