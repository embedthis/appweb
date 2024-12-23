/*
    websockets-1.tst - WebSocket send test
 */

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/proxy/websockets/basic/send"
const TIMEOUT = 5000

if (true) {
    let ws = new WebSocket(WS)

    let opened
    ws.onopen = function (event) {
        opened = true
        ws.send("Hello World")
    }

    ws.wait(WebSocket.OPEN, TIMEOUT)
    ttrue(opened)

    ws.close()
    ttrue(ws.readyState == WebSocket.CLOSING)
    ws.wait(WebSocket.CLOSED, TIMEOUT)
    ttrue(ws.readyState == WebSocket.CLOSED)
} else {
    tskip('DISABLED')
}
