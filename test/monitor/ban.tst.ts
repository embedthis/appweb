/*
    ban.tst - Monitor and ban defense tests

    Tests the server's defense monitoring and automatic client banning feature.
    Simulates a denial-of-service attempt by making many rapid requests to trigger
    the ban threshold, then validates that the client is temporarily banned and
    later unbanned after the timeout period. Only runs at test depth 5+.
 */

import {tdepth, tget, tskip, ttrue} from 'testme'
import {App, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (tdepth() >= 5) {

    // Trigger the ban with > 190 requests to 404 pages in 5 sec period
    for (let i in 200) {
        http.get(HTTP + "/unknown.html")
        await http.finalize()
        ttrue(http.status == 404)
        http.close()
    }

    // Wait for the ban to come into effect (should happen in 0-5 secs)
    for (let i in 10) {
        http.get(HTTP + "/unknown.html")
        await http.finalize()
        if (http.status == 404) {
            http.close()
            App.sleep(1000)
            continue
        }
        ttrue(http.status == 406)
        ttrue(http.response.contains("Client temporarily banned due to monitored limit exceeded"))
        break
    }

    // Verify client is banned
    ttrue(http.status == 406)
    http.close()

    // Verify that even valid URIs are now rejected
    http.get(HTTP + "/index.html")
    await http.finalize()
    ttrue(http.status == 406)
    http.close()

    // Wait for the ban to be lifted (should be 0-5 secs)
    for (let i in 10) {
        http.get(HTTP + "/index.html")
        await http.finalize()
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

    // Verify that valid URIs now work after ban is lifted
    http.get(HTTP + "/index.html")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

} else {
    tskip("runs at depth 5")
}
