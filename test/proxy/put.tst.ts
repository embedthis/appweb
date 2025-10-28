/*
    Test proxy handling of HTTP PUT requests

    This test verifies that the proxy correctly forwards PUT requests for
    file uploads using both direct and streaming methods.
 */

import {ttrue, tget} from 'testme'
import {ByteArray, File, Http, Path} from 'ejscript'

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

// Test PUT with complete content data
let data = new Path("test.dat").readString()

http.put(HTTP + "/tmp/test.dat?r1", data)

await http.finalize()
ttrue(http.status == 201 || http.status == 204)
http.close()

// Test streaming PUT with write() + finalize()
let path = new Path("test.dat")
http.uri = HTTP + "/tmp/test.dat?r3"
let file = await new File(path).open()
let buf = new ByteArray
while (await file.read(buf)) {
    http.write(buf)
    buf.flush()
}
await file.close()
await http.connect('PUT')
await http.finalize()
ttrue(http.status == 204)
http.close()
