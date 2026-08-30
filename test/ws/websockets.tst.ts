/*
    websockets.tst.ts - A standard client can open and close on the primary endpoint

    test/appweb.conf configures <Route ^/ws/> with the webSocketFilter and testWebSocketsHandler,
    and no test targeted it (10065) -- the existing WebSocket tests reach that handler through
    the proxy backend in proxy.conf instead.

    This file covers only what the Ejscript client can reach: that a conventional client library
    completes the upgrade against the primary endpoint and closes cleanly. Everything about the
    bytes -- the accept token, the reply frame header, the payload, and the negative handshake
    cases -- is in frames.tst.c beside this file, because the shim cannot write a binary frame
    (a frame header carries octets above 0x7f, which it UTF-8 encodes and thereby corrupts) and
    never delivers onmessage.
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
