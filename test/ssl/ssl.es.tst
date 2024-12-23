/*
    ssl.tst - Test SSL
 */

/*
dump("CONFIG", Config)
dump('AC', App.config)
dump('ENV', App.env)
*/

if (!Config.SSL) {
    tskip("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    let http: Http = new Http
    let top: Path = tget('TM_TOP')

    http.retries = 0
    http.ca = top.join('certs', 'ca.crt')
    ttrue(http.verify == true)
 
    //  Verify the server cert and send a client cert 
    endpoint = tget('TM_TESTCERT') || "https://127.0.0.1:7443"
    endpoint = endpoint.replace('127.0.0.1', 'localhost')
    http.key = top.join('certs', 'test.key')
    http.certificate = top.join('certs', 'test.crt')
    http.get(endpoint + '/index.html')
    ttrue(http.status == 200) 

/* MBEDTLS in testme has different info
    ttrue(http.info.CLIENT_S_CN == 'localhost')
    ttrue(http.info.SERVER_S_CN == 'localhost')
    ttrue(http.info.SERVER_I_OU != http.info.SERVER_S_OU)
    ttrue(http.info.SERVER_I_EMAIL == 'licensing@example.com')
*/
    http.close()

} else {
    tskip("SSL not enabled")
}
