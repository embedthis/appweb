/*
    Test SSL certificate verification and client certificate authentication

    This test verifies:
    - Server certificate verification with and without CA validation
    - Self-signed certificate handling
    - Client certificate authentication
    - Various SSL/TLS provider configurations (OpenSSL, MbedTLS, NanoSSL)
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {App, Config, Http, Path} from 'ejscript'

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    let http: Http
    let top = new Path(App.getenv('TM_TOP'))
    let bin = new Path(App.getenv('TM_BIN'))

    if (1 || App.getenv('ME_MBEDTLS') == 1) {
        http = new Http
        let endpoint = tget('TM_HTTPS') || "https://localhost:4443"
        endpoint = endpoint.replace('127.0.0.1', 'localhost')
        http.ca = top.join('certs', 'ca.crt')
        http.verify = true
        http.key = null
        http.certificate = null

        // Verify the server certificate without a client certificate
        ttrue(http.verify == true)
        ttrue(http.verifyIssuer == true)
        await http.get(endpoint + '/index.html')
        ttrue(http.status == 200)
        http.close()

        // Connect without verifying the server certificate
        endpoint = tget('TM_HTTPS') || "https://localhost:4443"
        endpoint = endpoint.replace('127.0.0.1', 'localhost')
        http.verify = false
        ttrue(http.verify == false)
        ttrue(http.verifyIssuer == false)
        await http.get(endpoint + '/index.html')
        ttrue(http.status == 200)
        http.close()

        if (!App.getenv('ME_NANOSSL')) {
            // NanoSSL does not support multiple configurations
            // Test a server self-signed certificate. Verify but not the issuer.
            // Note: in a self-signed cert the subject == issuer
            endpoint = tget('TM_SELFCERT') || "https://localhost:5443"
            endpoint = endpoint.replace('127.0.0.1', 'localhost')
            http.verify = true
            http.verifyIssuer = false
            await http.get(endpoint + '/index.html')
            ttrue(http.status == 200)
            http.close()

            // Test SSL with a client certificate
            endpoint = tget('TM_CLIENTCERT') || "https://localhost:6443"
            endpoint = endpoint.replace('127.0.0.1', 'localhost')
            http.key = top.join('certs', 'test.key')
            http.certificate = top.join('certs', 'test.crt')
            await http.get(endpoint + '/index.html')
            ttrue(http.status == 200)
        }
        http.close()
    }

} else {
    tskip("ssl not enabled")
}
