/*
    put.tst - Put method tests

    Tests HTTP PUT method for file uploads using both direct content upload
    and streaming upload with chunked writes.
 */

import {ttrue, tget} from 'testme'
import {ByteArray, File, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test PUT with content data (single upload)
let data = await new Path("test.dat").readString()
http.put(HTTP + "/tmp/test.dat", data)
await http.finalize()
ttrue(http.status == 201 || http.status == 204)
http.reset()

// Test streaming upload with write() + finalize()
http.connect('PUT', HTTP + '/tmp/test.dat')
let path = new Path("test.dat")
let file = await new File(path).open()
let buf = new ByteArray
while (await file.read(buf)) {
    http.write(buf)
    buf.flush()
}
await http.finalize()
await file.close()
ttrue(http.status == 204)

http.close()
