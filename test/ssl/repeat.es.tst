/*
    repeat.tst - Repeated SSL http tests using the default SSL provider (EST)
 */

if (!Config.SSL) {
    tinfo("ssl not enabled in ejs")

} else if (thas('ME_SSL')) {
    const HTTPS = tget('TM_HTTPS') || "https://127.0.0.1:4443"
    let http: Http = new Http

    /*
        With keep alive
     */
    http.verify = false
    for (i in 110) {
        http.get(HTTPS + "/index.html")
        ttrue(http.status == 200)
        ttrue(http.response)
        http.reset()
    }
    http.close()

    /*
        With-out keep alive
     */
    for (i in 50) {
        http.verify = false
        http.get(HTTPS + "/index.html")
        ttrue(http.status == 200)
        ttrue(http.response)
        http.close()
    }

} else {
    tskip("ssl not enabled")
}
