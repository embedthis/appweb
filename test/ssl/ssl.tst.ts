/*
    Test basic SSL functionality with mutual authentication

    This test verifies:
    - Server certificate verification using CA
    - Client certificate authentication
    - Full mutual TLS connection
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {App, Config, Http, Path} from 'ejscript'

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    let http: Http = new Http
    let top: Path = tget('TM_TOP')

    http.retries = 0
    http.ca = top.join('certs', 'ca.crt')
    ttrue(http.verify == true)

    // Verify the server certificate and send a client certificate
    endpoint = tget('TM_TESTCERT') || "https://127.0.0.1:7443"
    endpoint = endpoint.replace('127.0.0.1', 'localhost')
    http.key = top.join('certs', 'test.key')
    http.certificate = top.join('certs', 'test.crt')
    await http.get(endpoint + '/index.html')
    ttrue(http.status == 200)

    http.close()

} else {
    tskip("SSL not enabled")
}
