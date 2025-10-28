/*
    cmd.tst.ts - Test route command execution
    Verifies that route update commands can execute and create files
 */

import {ttrue, tget} from 'testme'
import {Config, Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test route command execution (not supported on VxWorks or Windows)
if (Config.OS != 'VXWORKS' && Config.OS != 'WIN') {
    let path = new Path('../route-update-cmd.tmp')
    path.remove()
    ttrue(!path.exists)

    //  Execute route command that creates a file
    http.get(HTTP + '/route/update/cmd')
    await http.finalize()

    //  Verify command executed successfully
    ttrue(http.status == 200)
    ttrue(http.response == 'UPDATED')
    ttrue(path.exists)
    ttrue(path.remove())
    http.close()
}
