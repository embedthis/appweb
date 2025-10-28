/*
    form.tst - Form-based authentication tests

    Tests HTML form-based authentication with session management. This authentication
    method is typically used for web applications and involves login forms, session
    cookies, and logout functionality. Form authentication redirects unauthenticated
    users to a login page.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const HTTPS = tget('TM_HTTPS') || "https://127.0.0.1:4443"

let http: Http = new Http

if (thas('ME_SSL') && false) {
    // Appweb uses a self-signed cert
    http.verify = false

    // Test access to protected resource without authentication - should redirect to login page
    http.setCredentials("anybody", "wrong password")
    http.get(HTTP + "/auth/form/index.html")
    await http.finalize()
    ttrue(http.status == 302)
    let location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    // Test accessing the login page - should return the login form
    http.get(location)
    await http.finalize()
    ttrue(http.status == 200)
    ttrue(http.response.contains("<form"))
    ttrue(http.response.contains('action="/auth/form/login"'))

    // Test submitting login form with valid credentials - should redirect to original resource
    http.reset()
    http.form(HTTP + "/auth/form/login", {username: "joshua", password: "pass1"})
    await http.finalize()
    ttrue(http.status == 302)
    location = http.header('location')
    ttrue(location.contains('http://'))
    ttrue(location.contains('/auth/form'))
    let cookie = http.header("Set-Cookie")
    ttrue(cookie.match(/(-http-session-=.*);/)[1])

    // Test accessing protected resource with valid session cookie - should succeed
    http.reset()
    http.setCookie(cookie)
    http.get(HTTP + "/auth/form/index.html")
    await http.finalize()
    ttrue(http.status == 200)

    // Test logout - should redirect to login page
    http.reset()
    http.setCookie(cookie)
    http.post(HTTP + "/auth/form/logout")
    await http.finalize()
    ttrue(http.status == 302)
    location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    // Test accessing protected resource after logout - should redirect to login page again
    http.get(HTTP + "/auth/form/index.html")
    await http.finalize()
    ttrue(http.status == 302)
    location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    http.close()
} else {
    tskip("SSL tests not enabled")
}
