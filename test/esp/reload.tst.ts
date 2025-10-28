/*
    reload.tst.ts - Test ESP dynamic reloading
    Verifies that ESP can reload modified pages (currently disabled)
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {App, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test currently disabled
if (thas('ME_DEBUG') && false) {
    //  Create initial test page
    let path = new Path('../web/reload.esp')
    path.write('<html><body><% render("First", -1); %></body></html>')
    http.get(HTTP + '/reload.esp')
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('First'))
    http.close()

    //  Wait to ensure different mtime
    App.sleep(1100);

    //  Modify page and verify reload
    path.write('<html><body><% render("Second", -1); %></body></html>')
    http.get(HTTP + '/reload.esp')
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains('Second'))
    http.close()

    path.remove()

} else {
    tskip('Disabled')
}
