import {ByteArray, Http} from 'ejscript'

const HTTP = "127.0.0.1:4100"
let http: Http = new Http

http.get(HTTP + "/big.esp")
await http.finalize()

console.log("Status:", http.status)
console.log("Response length:", http.response.length)

let buf = new ByteArray()
console.log("Initial buf.length:", buf.length)

let firstRead = http.read(buf)
console.log("First read returned:", firstRead)
console.log("buf.length after first read:", buf.length)
console.log("buf.writePosition after first read:", buf.writePosition)

http.close()
