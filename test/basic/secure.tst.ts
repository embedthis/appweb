/*
    secure.tst - SSL http tests

    Tests HTTPS connections including secure connection detection, certificate
    verification (disabled for testing with self-signed certs), and various
    HTTP methods over SSL/TLS.
 */

import {thas, tinfo, tskip, ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

if (!Config.SSL) {
    tinfo("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
    const HTTPS = tget('TM_HTTPS') || "https://127.0.0.1:4443"
    let http: Http = new Http

    // Test non-secure connection detection
    http.verify = false
    http.get(HTTP + "/index.html")
    await http.finalize()
    ttrue(!http.isSecure)
    http.close()

    // Test secure connection detection
    http.verify = false
    http.get(HTTPS + "/index.html")
    await http.finalize()
    ttrue(http.isSecure)
    http.close()

    // Test reading content over HTTPS
    http.verify = false
    http.get(HTTPS + "/index.html")
    await http.finalize()
    ttrue(http.readString(12) == "<html><head>")
    ttrue(http.readString(7) == "<title>")
    http.close()

    // Test GET with query parameters over HTTPS
    http.verify = false
    http.get(HTTPS + "/index.html?a=b")
    await http.finalize()
    ttrue(http.response.endsWith("</html>\n"))
    http.close()

    // Test POST over HTTPS
    http.verify = false
    http.post(HTTPS + "/index.html", "Some data")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

} else {
    tskip("ssl not enabled")
}
