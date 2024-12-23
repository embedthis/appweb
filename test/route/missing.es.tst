/*
    missing.tst - Add extension
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_FAST') && Config.OS == 'macosx') {
    http.get(HTTP + "/route/missing-ext/index")
    if (http.status != 200) {
        print("STATUS", http.status)
        print(http.response)
    }
    ttrue(http.status == 200)
    ttrue(http.response.contains("Hello PHP World"))
    http.close()
} else {
    tskip("fast not enabled")
}
