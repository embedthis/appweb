/*
    pausing.tst.ts - Test flow control with paused reading
    Verifies that server properly handles backpressure when client reads slowly
 */

import {print, tdepth, tget, ttrue} from 'testme'
import {App, ByteArray, File, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
import {contains, keyword, match} from './cgi'

//  Test sizes scale with depth (in units of 102400)
let sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
let len = sizes[tdepth()] * 102400
let bytes = len * 11

//  Request large response
let http = new Http
http.setHeader('SWITCHES', '-b%20' + len)
http.get(HTTP + '/cgi-bin/cgiProgram')
await http.finalize()
ttrue(http.status == 200)

//  Read data slowly with pauses to trigger flow control
let data = new ByteArray(1024 * 16, false)
let count = 0
let fp = await new File('a.tmp', 'w').open()
while (true) {
    if ((await http.read(data)) == null) {
        break
    }
    await fp.write(data)
    count += data.length
    App.sleep(5)
    if ((await http.read(data)) == null) {
        break
    }
    await fp.write(data)
    count += data.length
}
await fp.close()
await new Path('a.tmp').remove()

//  Verify all data received
ttrue(count == bytes)
http.close()
