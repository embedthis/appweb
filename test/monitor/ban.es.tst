/*
    ban.tst - Monitor and ban defense tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (tdepth() >= 5) {
    /*
        Trigger the ban with > 190 requests in a 5 sec period
     */
    for (i in 200) {
        http.get(HTTP + "/unknown.html")
        ttrue(http.status == 404)
        http.close()
    }
    /*
        Wait for the ban to come into effect. Should happen in 0-5 secs.
     */
    for (i in 10) {
        http.get(HTTP + "/unknown.html")
        if (http.status == 404) {
            http.close()
            App.sleep(1000)
            continue
        }
        ttrue(http.status == 406)
        ttrue(http.response.contains("Client temporarily banned due to monitored limit exceeded"))
        break
    }
    /*
        Should be banned
     */
    ttrue(http.status == 406)
    http.close()

    /* 
        A valid URI should now fail 
     */
    http.get(HTTP + "/index.html")
    ttrue(http.status == 406)
    http.close()

    /*
        Wait for the ban to be lifted. Should be 0-5 secs.
     */
    for (i in 10) {
        http.get(HTTP + "/index.html")
        if (http.status == 406) {
            ttrue(http.response.contains("Client temporarily banned due to monitored limit exceeded"))
            http.close()
            App.sleep(1000)
            continue
        }
        ttrue(http.status == 200) 
        break
    }
    ttrue(http.status == 200) 
    http.close()
    
    /* 
        A valid URI should now work 
     */
    http.get(HTTP + "/index.html")
    ttrue(http.status == 200)
    http.close()

} else {
    tskip("runs at depth 5")
}
