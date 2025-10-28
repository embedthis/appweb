/*
    ssl.tst.ts - ESP WebSocket over SSL test
    Verifies that ESP WebSocket connections work over SSL/TLS
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Config, WebSocket, deserialize} from 'ejscript'

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (!thas('ME_SSL')) {
    tskip("ssl not enabled")

} else {
    const HTTPS = tget('TM_HTTPS') || "https://localhost:4443"
    var WS = HTTPS.replace('https', 'wss') + '/websockets/basic/ssl'
    WS = WS.replace('wss://:4443', 'wss://localhost:4443')
    const TIMEOUT = 5000

    let ws = new WebSocket(WS, ['chat'], { verify: false })
    ttrue(ws != null)
    ttrue(ws.readyState == WebSocket.CONNECTING)

    let closed, opened, response
    let msg = "Hello Server"
    ws.onopen = function (event) {
        let opened = true
        ws.send(msg)
    }
    ws.onclose = function (event) {
        closed = true
    }
    ws.onmessage = function (event) {
        ttrue(typeof event.data === "string")
        response = event.data
        ws.close()
    }
    await ws.wait(WebSocket.OPEN, TIMEOUT)
    ttrue(opened)

    await ws.wait(WebSocket.CLOSED, TIMEOUT)
    ttrue(ws.readyState == WebSocket.CLOSED)
    ttrue(closed)

    let info = deserialize(response)
    ttrue(info.type == 1)
    ttrue(info.last == 1)
    ttrue(info.length == msg.length)
    ttrue(info.data == "Hello Serv")
}
