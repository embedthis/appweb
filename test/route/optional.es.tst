/*
    optional.tst - Test optional tokens
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Route: ^/optional/{controller}(~/{action}~)

//  Test just a controller
http.get(HTTP + "/route/optional/user")
ttrue(http.status == 200)
ttrue(http.response == "user/")

//  With trailing "/"
http.get(HTTP + "/route/optional/user/")
ttrue(http.status == 200)
ttrue(http.response == "user/")

//  Test controller/action
http.get(HTTP + "/route/optional/user/login")
ttrue(http.status == 200)
ttrue(http.response == "user/login")
http.close()
