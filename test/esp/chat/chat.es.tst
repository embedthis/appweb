/*
    chat.es.tst - Stress test web sockets
 */

const HTTP = "http://127.0.0.1:4100"
let uri = HTTP.replace('http:', 'ws:') + '/chat/test/chat'

var iterations = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

let http: Http = new Http

let count = iterations[tdepth()] * 20

let ws = new WebSocket(uri)
let messageCount = 0

ws.onmessage = function (event) {
    // print("GOT", event.data)
    messageCount++
}

ws.onopen = function (event) {
    // print("ONOPEN")
}

ws.onclose = function () {
    if (ws.readyState == WebSocket.Loaded) {
        App.emitter.fire("complete")
    }
}

for (let i = 0; i < count; i++) {
//print("SEND", i, count)
    ws.send("Hello WebSocket World: " + i)
    App.sleep(10)
}

ws.close()
// print("COUNT", messageCount)
ttrue(messageCount == count)
