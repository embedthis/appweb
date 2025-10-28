/*
    Test server resilience against denial of service attacks

    This test verifies that the server can handle many rapid invalid connections
    without crashing or becoming unavailable. The test:
    - Verifies server is available initially
    - Opens 1000 rapid connections with invalid data
    - Verifies server is still functional after the attack
 */

import {tdepth, tget, tskip, ttrue} from 'testme'
import {App, Config, Http, Socket, Uri} from 'ejscript'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

if (tdepth() >= 6) {
    // Check server available before attack
    http = new Http
    http.get(HTTP + "/index.html")

    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // TODO: Enable on Windows when issues are resolved
    if (Config.OS != 'windows') {
        // Attempt DOS attack with rapid invalid connections
        for (let i in 1000) {
            let s = new Socket
            try {
                s.connect(HTTP.address)
            } catch (e) {
                throw e
            }
            let written = s.write("Any Text")
            ttrue(written == 8)
            s.close()
        }
    }
    App.sleep(5000)

    // Check server still available after attack
    http = new Http
    http.get(HTTP + "/index.html")

    await http.finalize()
    ttrue(http.status == 200)
    http.close()
} else {
    tskip('Runs at depth 6')
}
