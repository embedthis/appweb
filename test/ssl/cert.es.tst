/*
    cert.tst - Test SSL certificates
 */

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    let http: Http
    let top = Path(App.getenv('TM_TOP'))
    let bin = Path(App.getenv('TM_BIN'))

    if (1 || App.getenv('ME_MBEDTLS') == 1) {
        http = new Http
        let endpoint = tget('TM_HTTPS') || "https://localhost:4443"
        endpoint = endpoint.replace('127.0.0.1', 'localhost')
        http.ca = top.join('certs', 'ca.crt')
        http.verify = true
        http.key = null
        http.certificate = null

        //  Verify the server (without a client cert)
        ttrue(http.verify == true)
        ttrue(http.verifyIssuer == true)
        http.get(endpoint + '/index.html')
        ttrue(http.status == 200) 
/* MBEDTLS has different info
        ttrue(http.info.SERVER_S_CN == 'localhost')
        ttrue(http.info.SERVER_I_EMAIL == 'licensing@example.com')
        ttrue(http.info.SERVER_I_OU != http.info.SERVER_S_OU)
        ttrue(!http.info.CLIENT_S_CN)
*/
        http.close()

        //  Without verifying the server
        let endpoint = tget('TM_HTTPS') || "https://localhost:4443"
        endpoint = endpoint.replace('127.0.0.1', 'localhost')
        http.verify = false
        ttrue(http.verify == false)
        ttrue(http.verifyIssuer == false)
        http.get(endpoint + '/index.html')
        ttrue(http.status == 200) 
/* MBEDTLS has different info
        ttrue(http.info.SERVER_S_CN == 'localhost')
        ttrue(http.info.SERVER_I_EMAIL == 'licensing@example.com')
        ttrue(http.info.SERVER_I_OU != http.info.SERVER_S_OU)
        ttrue(!http.info.CLIENT_S_CN)
*/
        http.close()

        if (!App.getenv('ME_NANOSSL')) {
            //  NanoSSL does not support multiple configurations
            //  Test a server self-signed cert. Verify but not the issuer.
            //  Note in a self-signed cert the subject == issuer
            let endpoint = tget('TM_SELFCERT') || "https://localhost:5443"
            endpoint = endpoint.replace('127.0.0.1', 'localhost')
            http.verify = true
            http.verifyIssuer = false
            http.get(endpoint + '/index.html')
            ttrue(http.status == 200) 
/* MBEDTLS has different info
            ttrue(http.info.SERVER_S_CN == 'localhost')
            ttrue(http.info.SERVER_I_OU == http.info.SERVER_S_OU)
            ttrue(http.info.SERVER_I_EMAIL == 'dev@example.com')
            ttrue(!http.info.CLIENT_S_CN)
*/
            http.close()

            //  Test SSL with a client cert 
            endpoint = tget('TM_CLIENTCERT') || "https://localhost:6443"
            endpoint = endpoint.replace('127.0.0.1', 'localhost')
            http.key = top.join('certs', 'test.key')
            http.certificate = top.join('certs', 'test.crt')
            // http.verify = false
            http.get(endpoint + '/index.html')
            ttrue(http.status == 200) 
            // ttrue(info.PROVIDER == provider)
/* MBEDTLS has different info
            ttrue(http.info.CLIENT_S_CN == 'localhost')
            ttrue(http.info.SERVER_S_CN == 'localhost')
            ttrue(http.info.SERVER_I_OU != http.info.SERVER_S_OU)
            ttrue(http.info.SERVER_I_EMAIL == 'licensing@example.com')
*/
        }
        http.close()
    }

} else {
    tskip("ssl not enabled")
}
