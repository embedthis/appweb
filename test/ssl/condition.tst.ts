/*
    Test conditional routing based on SSL certificate data

    This test verifies that routes can require client certificates and properly
    reject connections without certificates while accepting connections with valid
    client certificates.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {App, Config, Http, Path} from 'ejscript'

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    let http: Http
    let top = new Path(App.getenv('TM_TOP'))

    // NanoSSL does not support verifying client certificates
    if (!App.getenv('ME_NANOSSL') == 1) {
        http = new Http
        http.verify = false

        // Should fail if no client certificate is provided
        endpoint = tget('TM_CLIENTCERT') || "https://127.0.0.1:6443"
        let caught
        try {
            // Server should deny and handshake should fail
            await http.get(endpoint + '/ssl-match/index.html')
            ttrue(http.status == 200)
        } catch {
            caught = true
        }
        ttrue(caught)
        http.close()

        // Should succeed when providing a valid client certificate
        endpoint = tget('TM_CLIENTCERT') || "https://127.0.0.1:6443"
        http.key = top.join('certs', 'test.key')
        http.certificate = top.join('certs', 'test.crt')
        await http.get(endpoint + '/ssl-match/index.html')
        ttrue(http.status == 200)
        http.close()
    }

} else {
    tskip("ssl not enabled")
}
