/*
    close.tst - WebSocket close test
 */

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/open"
const TIMEOUT = 35000

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)
ws.wait(WebSocket.OPEN, TIMEOUT)
if (ws.readyState != WebSocket.OPEN) {
    print("READY STATE", ws.readyState)
}
ttrue(ws.readyState == WebSocket.OPEN)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING)
ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)
