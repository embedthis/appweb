/*
    Test repeated SSL HTTP requests to verify connection stability

    This test verifies SSL connection handling under repeated requests with:
    - Keep-alive connections (connection reuse)
    - Non-keep-alive connections (new connection per request)
 */

import {thas, tinfo, tskip, ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

if (!Config.SSL) {
    tinfo("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    const HTTPS = tget('TM_HTTPS') || "https://127.0.0.1:4443"
    let http: Http = new Http

    // Test with keep-alive (connection reuse)
    http.verify = false
    for (let i in 110) {
        await http.get(HTTPS + "/index.html")
        ttrue(http.status == 200)
        ttrue(http.response)
        http.reset()
    }
    http.close()

    // Test without keep-alive (new connection per request)
    for (let i in 50) {
        http.verify = false
        await http.get(HTTPS + "/index.html")
        ttrue(http.status == 200)
        ttrue(http.response)
        http.close()
    }

} else {
    tskip("ssl not enabled")
}
