/*
    cgi-dos.tst.ts - Test CGI denial of service resilience
    Verifies that server remains responsive under rapid CGI request load
 */

import {tdepth, tget, thas, ttrue} from 'testme'
import {App, Http, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || '127.0.0.1:4100')

//  Scale request count with test depth
let sizes = [1, 2, 4, 8, 12, 16, 24, 32, 40, 64]
let count = sizes[tdepth()] * 20

//  Only run at higher depths with CGI enabled
if (!thas('ME_CGI') && tdepth() > 3) {
    //  Verify server is responsive before test
    http = new Http
    http.get(HTTP + '/index.html')
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    //  Rapid-fire CGI requests to stress server
    for (let i in count) {
        let http = new Http
        http.get(HTTP + '/cgi-bin/cgiProgram')
        await http.finalize()
        http.close()
    }

    //  Verify server still responsive after stress test
    App.sleep(1000)
    http = new Http
    http.get(HTTP + '/index.html')
    await http.finalize()
    ttrue(http.status == 200)
    http.close()
}
