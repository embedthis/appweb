/*
    missing.tst.ts - Test automatic extension addition for missing file extensions
    Verifies that routes can automatically add extensions to resolve files
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  Test extension addition (requires FastCGI on macOS)
if (thas('ME_FAST') && Config.OS == 'macosx') {
    //  Request file without extension - should auto-add .php
    http.get(HTTP + '/route/missing-ext/index')
    await http.finalize()

    //  Verify extension was added and PHP file was served
    ttrue(http.status == 200)
    ttrue(http.response.contains('Hello PHP World'))
    http.close()
} else {
    tskip('fast not enabled')
}
