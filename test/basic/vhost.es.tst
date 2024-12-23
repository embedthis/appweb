/*
    vhost.tst - Virtual Host tests
 */

let http: Http = new Http

function mainHost() {
    let HTTP = tget('TM_HTTP') + ''
    http.get(HTTP + "/main.html")
    http.response.contains("HTTP SERVER")
    ttrue(http.status == 200)
    http.reset()

    //  These should fail
    http.get(HTTP + "/iphost.html")
    ttrue(http.status == 404)
    http.reset()

    http.get(HTTP + "/vhost1.html")
    ttrue(http.status == 404)
    http.reset()

    http.get(HTTP + "/vhost2.html")
    ttrue(http.status == 404)
    http.close()
}


//  The first virtual host listens to "localhost", the second listens to HTTP.

function namedHost() {
    let NAMED = tget('TM_NAMED') + ''
    http = new Http
    http.setHeader("Host", "localhost:" + Uri(NAMED).port)
    http.get(NAMED + "/vhost1.html")
    if (http.status != 200) {
        print('Failed', http.status)
        print('Response', http.response)
    }
    ttrue(http.status == 200)
    http.close()

    //  These should fail
    http = new Http
    http.setHeader("Host", "localhost:" + Uri(NAMED).port)
    http.get(NAMED + "/main.html")
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "localhost:" + Uri(NAMED).port)
    http.get(NAMED + "/iphost.html")
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "localhost:" + Uri(NAMED).port)
    http.get(NAMED + "/vhost2.html")
    ttrue(http.status == 404)
    http.close()

    //  Now try the second vhost on 127.0.0.1
    http = new Http
    http.setHeader("Host", "127.0.0.1:" + Uri(NAMED).port)
    http.get(NAMED + "/vhost2.html")
    ttrue(http.status == 200)
    http.close()

    //  These should fail
    http = new Http
    http.setHeader("Host", "127.0.0.1:" + Uri(NAMED).port)
    http.get(NAMED + "/main.html")
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "127.0.0.1:" + Uri(NAMED).port)
    http.get(NAMED + "/iphost.html")
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "127.0.0.1:" + Uri(NAMED).port)
    http.get(NAMED + "/vhost1.html")
    ttrue(http.status == 404)
    http.close()
}

function ipHost() {
    let VIRT = tget('TM_VIRT') + ''
    let http: Http = new Http
    http.setCredentials("mary", "pass2")
    http.setHeader("Host", "127.0.0.1:" + Uri(VIRT).port)
    http.get(VIRT + "/private.html")
    ttrue(http.status == 200)
    if (http.status != 200) {
        print('Failed', http.status)
        print('Response', http.response)
    }
    http.close()
}

mainHost()
namedHost()
ipHost()
