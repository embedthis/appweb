/*
    Test URI validation and rejection of malformed URIs

    This test verifies that the server properly rejects invalid URIs:
    - URIs without leading slash
    - URIs with control characters
    - URIs with backslashes
 */

import {tfail, tget, ttrue} from 'testme'
import {ByteArray, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

async function get(uri: string): Promise<string> {
    let s = new Socket
    s.connect(HTTP.address)
    let count = 0
    let data = "GET " + uri + " HTTP/1.0\r\n\r\n"
    try {
        count += await s.write(data)
    } catch {
        tfail("Write failed. Wrote " + count + " of " + data.length + " bytes.")
    }
    let response = new ByteArray
    let n: number | null
    while ((n = await s.read(response, -1)) != null) {}
    s.close()
    return response.toString()
}

// Test URI without leading slash
let response: string
response = await get('index.html')
ttrue(response.toString().contains('Bad Request'))

// Test URI with control character
response = await get('/\x01index.html')
ttrue(response.toString().contains(' 400 -- Bad Request'))

// Test URI with backslash
response = await get('\\index.html')
ttrue(response.toString().contains(' 400 -- Bad Request'))
