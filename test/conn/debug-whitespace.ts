import {tget} from 'testme'
import {Uri} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
console.log('HTTP type:', typeof HTTP)
console.log('HTTP value:', HTTP)
console.log('HTTP instanceof Uri:', HTTP instanceof Uri)

if (HTTP instanceof Uri) {
    console.log('HTTP.address:', HTTP.address)
} else {
    const uri = new Uri(HTTP)
    console.log('new Uri(HTTP).address:', uri.address)
}
