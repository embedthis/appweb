/*
    Test proxy WebSocket sendBlock API

    This test verifies advanced WebSocket block sending APIs through the proxy.
    Currently disabled as advanced APIs (sendBlock, MSG_TEXT, MSG_CONT, etc.)
    are not yet implemented.
 */

import {tskip, ttrue, tget} from 'testme'
import {App, ByteArray, WebSocket} from 'ejscript'

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/proxy/websockets/basic/len"

const TIMEOUT = 10000
const LEN = 10 * 1024 * 10

if (false) {
    // SKIP: Advanced WebSocket APIs not yet implemented
    let data = new ByteArray(LEN)
    for (let i = 0; i < LEN / 50; i++) {
        data.write("01234567890123456789012345678901234567890123456789")
    }
    let dataLength = data.length

    ttrue(WebSocket)
    let ws = new WebSocket(WS)
    ttrue(ws)
    ttrue(ws.readyState == WebSocket.CONNECTING)

    let opened = false
    ws.onopen = function (event) {
        opened = true
    }
    ws.onerror = function (event) {
        opened = false
    }

    let msg: string | null = null
    ws.onmessage = function (event) {
        ttrue(typeof event.data === 'string')
        msg = event.data
    }

    function sendBlock(data, options) {
        let mark = new Date
        msg = null
        options.type = WebSocket.MSG_TEXT
        do {
            let rc = ws.sendBlock(data, options)
            data.readPosition += rc
            options.type = WebSocket.MSG_CONT
            /*
                Normally this would be event based, but for a simple unit test, we just wait
             */
            App.sleep(10);
        } while (data.length > 0 && opened)
        while (opened && !msg && mark.elapsed < TIMEOUT) {
            App.run(10, true)
        }
        data.readPosition = 0
        return msg
    }

    await ws.wait(WebSocket.OPEN, TIMEOUT)
    ttrue(opened)

    /*
        Non-blocking test
     */
    response = sendBlock(data, { mode: WebSocket.NON_BLOCK })
    let info = deserialize(response)
    ttrue(info.length == dataLength)
    ttrue(info.type == 1)
    ttrue(info.last == 1)

    /*
    // Buffered test
    response = sendBlock(data, { mode: WebSocket.BUFFER })
    info = deserialize(response)
    ttrue(info.length == dataLength)
    ttrue(info.type == 1)
    ttrue(info.last == 1)

    // Buffered test
    response = sendBlock(data, { mode: WebSocket.BLOCK })
    info = deserialize(response)
    ttrue(info.length == dataLength)
    ttrue(info.type == 1)
    ttrue(info.last == 1)
    */

    ws.close()
    ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
    await ws.wait(WebSocket.CLOSED, TIMEOUT)
    ttrue(ws.readyState == WebSocket.CLOSED)

} else {
    tskip('DISABLED')
}
