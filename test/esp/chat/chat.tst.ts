/*
    chat.tst.ts - ESP WebSocket chat stress test
    Verifies that ESP WebSocket chat can handle multiple rapid messages
 */

import {tdepth, ttrue} from 'testme'
import {WebSocket} from 'ejscript'

const HTTP = "http://127.0.0.1:4100"
let uri = HTTP.replace('http:', 'ws:') + '/chat/test/chat'

var iterations = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

let count = iterations[tdepth()] * 20

let ws = new WebSocket(uri)
let messageCount = 0

ws.onmessage = function (event) {
    messageCount++
}

ws.onopen = function (event) {
}

ws.onclose = function () {
    if (ws.readyState == WebSocket.CLOSED) {
    }
}

await ws.wait(WebSocket.OPEN, 5000)

for (let i = 0; i < count; i++) {
    ws.send("Hello WebSocket World: " + i)
    await Bun.sleep(10)
}

ws.close()
await ws.wait(WebSocket.CLOSED, 5000)
ttrue(messageCount == count)
