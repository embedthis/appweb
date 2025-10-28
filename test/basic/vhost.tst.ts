/*
    vhost.tst - Virtual Host tests

    Tests virtual host configuration and routing. Validates that requests are
    properly routed to the correct virtual host based on the Host header and
    that resources are isolated between virtual hosts.
 */

import {ttrue, tget} from 'testme'
import {Http, Uri} from 'ejscript'

let http: Http = new Http

// Test main host - should only serve main.html, not virtual host resources
async function mainHost() {
    let HTTP = tget('TM_HTTP') + ''
    http.get(HTTP + "/main.html")
    await http.finalize()
    ttrue(http.response.contains("MAIN SERVER"))
    ttrue(http.status == 200)
    http.reset()

    // These requests to virtual host resources should fail on main host
    http.get(HTTP + "/iphost.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.reset()

    http.get(HTTP + "/vhost1.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.reset()

    http.get(HTTP + "/vhost2.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()
}

// Test named virtual hosts using Host header routing
async function namedHost() {
    let NAMED = tget('TM_NAMED') + ''

    // Test first vhost (localhost) can access vhost1.html
    http = new Http
    http.setHeader("Host", "localhost:" + new Uri(NAMED).port)
    http.get(NAMED + "/vhost1.html")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test first vhost cannot access main host resources
    http = new Http
    http.setHeader("Host", "localhost:" + new Uri(NAMED).port)
    http.get(NAMED + "/main.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "localhost:" + new Uri(NAMED).port)
    http.get(NAMED + "/iphost.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "localhost:" + new Uri(NAMED).port)
    http.get(NAMED + "/vhost2.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()

    // Test second vhost (127.0.0.1) can access vhost2.html
    http = new Http
    http.setHeader("Host", "127.0.0.1:" + new Uri(NAMED).port)
    http.get(NAMED + "/vhost2.html")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()

    // Test second vhost cannot access main or other vhost resources
    http = new Http
    http.setHeader("Host", "127.0.0.1:" + new Uri(NAMED).port)
    http.get(NAMED + "/main.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "127.0.0.1:" + new Uri(NAMED).port)
    http.get(NAMED + "/iphost.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()

    http = new Http
    http.setHeader("Host", "127.0.0.1:" + new Uri(NAMED).port)
    http.get(NAMED + "/vhost1.html")
    await http.finalize()
    ttrue(http.status == 404)
    http.close()
}

// Test IP-based virtual host with authentication
async function ipHost() {
    let VIRT = tget('TM_VIRT') + ''
    http = new Http
    http.setCredentials("mary", "pass2")
    http.setHeader("Host", "127.0.0.1:" + new Uri(VIRT).port)
    http.get(VIRT + "/private.html")
    await http.finalize()
    ttrue(http.status == 200)
    http.close()
}

await mainHost()
await namedHost()
await ipHost()
