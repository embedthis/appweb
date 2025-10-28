/*
    session.tst.ts - ESP session management tests
    Verifies that ESP sessions handle authentication, cookies, and XSRF tokens correctly
 */

import {tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

tskip("Temp disabled")
if (false) {

    http.get(HTTP + "/session/login")
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains("Please Login"))
    let securityToken = http.header("X-XSRF-TOKEN")
    let cookie = http.header("Set-Cookie")
    if (cookie) {
        cookie = cookie.match(/(esp-app=.*);/)[1]
    }

    ttrue(cookie && cookie.contains("esp-app="))
    http.reset()

    http.setCookie(cookie)
    http.setHeader("X-XSRF-TOKEN", securityToken)
    http.form(HTTP + "/session/login", {
        username: "admin",
        password: "secret",
        color: "blue"
    })
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains("Valid Login"))
    if (http.header("Set-Cookie")) {
        cookie = http.header("Set-Cookie");
        cookie = cookie.match(/(esp-app=.*);/)[1]
    }
    http.reset()

    http.setCookie(cookie)
    http.get(HTTP + "/session/login")
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains("Logged in"))
    http.close()

}