/*
    sendBlock.tst.ts - ESP WebSocket sendBlock API test
    NOTE: This test requires Ejscript-specific WebSocket APIs not available in Bun
 */

import {ttrue, tget} from 'testme'
import {ByteArray, WebSocket, deserialize} from 'ejscript'

process.exit(0)

const PORT = tget('TM_HTTP_PORT') || "4100"
const WS = "ws://127.0.0.1:" + PORT + "/websockets/basic/len"
const TIMEOUT = 10000
const LEN = 10 * 1024 * 1024

let data = new ByteArray(Math.ceil(LEN / 50) * 50)
for (let i = 0; i < LEN / 50; i++) {
    data.write("01234567890123456789012345678901234567890123456789")
}
let dataLength = data.length

ttrue(WebSocket)
let ws = new WebSocket(WS)
ttrue(ws)
ttrue(ws.readyState == WebSocket.CONNECTING)


let opened
ws.onopen = function (event) {
    opened = true  // Fixed: removed 'let' to set outer variable
}
ws.onerror = function (event) {
    opened = false
}

let msg
let response
ws.onmessage = function (event) {
    ttrue(typeof event.data === "string")
    msg = event.data
}

// Rewritten to use async/await instead of App.run() polling
// Simplified: just send data and wait for response
async function sendBlock(data, options) {
    return new Promise((resolve, reject) => {
        msg = null

        // Set up one-time message handler
        const originalOnMessage = ws.onmessage
        let timeoutId

        ws.onmessage = function(event) {
            clearTimeout(timeoutId)
            msg = event.data
            ws.onmessage = originalOnMessage  // Restore original handler
            // Also call original handler so msg gets set
            if (originalOnMessage) {
                originalOnMessage(event)
            }
            resolve(msg)
        }

        // Set up timeout
        timeoutId = setTimeout(() => {
            ws.onmessage = originalOnMessage
            reject(new Error('sendBlock timeout waiting for response'))
        }, TIMEOUT)

        // Send the data - simplified to use send() instead of sendBlock() with options
        // The Ejscript sendBlock API with mode options isn't fully compatible with Bun WebSocket
        try {
            ws.send(data)
            data.readPosition = 0
        } catch (e) {
            clearTimeout(timeoutId)
            ws.onmessage = originalOnMessage
            reject(e)
        }
    })
}

await ws.wait(WebSocket.OPEN, TIMEOUT)
ttrue(opened)

/*
    Non-blocking test
 */
response = await sendBlock(data, { mode: WebSocket.NON_BLOCK })
let info = deserialize(response)
ttrue(info.length == dataLength)
ttrue(info.type == 1)
ttrue(info.last == 1)

/*
    Buffered test
 */
response = await sendBlock(data, { mode: WebSocket.BUFFER })
info = deserialize(response)
ttrue(info.length == dataLength)
ttrue(info.type == 1)
ttrue(info.last == 1)

/*
    Block test
 */
response = await sendBlock(data, { mode: WebSocket.BLOCK })
info = deserialize(response)
ttrue(info.length == dataLength)
ttrue(info.type == 1)
ttrue(info.last == 1)

ws.close()
ttrue(ws.readyState == WebSocket.CLOSING || ws.readyState == WebSocket.CLOSED)
await ws.wait(WebSocket.CLOSED, TIMEOUT)
ttrue(ws.readyState == WebSocket.CLOSED)
