/*
    form.tst - Form-based authentication tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const HTTPS = tget('TM_HTTPS') || "https://127.0.0.1:4443"

let http: Http = new Http

if (thas('ME_SSL') && false) {
    //  Appweb uses a self-signed cert
    http.verify = false

    //  Will be denied and redirct to the login page
    http.setCredentials("anybody", "wrong password")
    http.get(HTTP + "/auth/form/index.html")
    ttrue(http.status == 302)
    let location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    //  Will return login form
    http.get(location)
    ttrue(http.status == 200)
    ttrue(http.response.contains("<form"))
    ttrue(http.response.contains('action="/auth/form/login"'))

    //  Login. The response should redirct to /auth/form
    http.reset()
    http.form(HTTP + "/auth/form/login", {username: "joshua", password: "pass1"})
    ttrue(http.status == 302)
    location = http.header('location')
    ttrue(location.contains('http://'))
    ttrue(location.contains('/auth/form'))
    let cookie = http.header("Set-Cookie")
    ttrue(cookie.match(/(-http-session-=.*);/)[1])

    //  Now logged in
    http.reset()
    http.setCookie(cookie)
    http.get(HTTP + "/auth/form/index.html")
    ttrue(http.status == 200)

    //  Now log out. Will be redirected to the login page.
    http.reset()
    http.setCookie(cookie)
    http.post(HTTP + "/auth/form/logout")
    ttrue(http.status == 302)
    let location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    //  Should fail to access index.html and get the login page again.
    http.get(HTTP + "/auth/form/index.html")
    ttrue(http.status == 302)
    let location = http.header('location')
    ttrue(location.contains('http'))
    ttrue(location.contains('login.esp'))

    http.close()
} else {
    tskip("SSL tests not enabled")
}
