/*
    action.tst.ts - The action handler
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

//  A URI naming no registered action is not found -- not a 500, and not a served file
for (let path of ['/action/', '/action/nosuch', '/action/index.html', '/action/login']) {
    http = new Http
    http.get(HTTP + path)
    await http.finalize()
    teq(http.status, 404)
    http.close()
}

/*
    The route must not fall through to the file handler. web/index.html exists, so if the action
    route ever stopped claiming its prefix, /action/index.html would start returning document
    content instead of 404 -- a routing change that nothing else in the suite would notice.
 */
http = new Http
http.get(HTTP + '/action/index.html')
await http.finalize()
teq(http.status, 404)
ttrue(!http.response.contains('<html><head>'))
http.close()

/*
    A dot segment inside the action prefix is normalised before route selection, so
    /action/../index.html resolves to /index.html and is served by the file handler. That is the
    correct outcome and the one SEC-010 requires -- normalise, then route -- and it is asserted
    rather than assumed, because a server that routed first would hand these bytes to the action
    handler with the dot segments intact.
 */
for (let path of ['/action/../index.html', '/action/%2e%2e/index.html']) {
    http = new Http
    http.get(HTTP + path)
    await http.finalize()
    teq(http.status, 200)
    ttrue(http.response.contains('Hello /index.html'))
    http.close()
}

//  A traversal that would leave the document root is refused, however it is encoded
for (let path of ['/action/../../etc/passwd', '/action/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
                  '/action/....//....//etc/passwd']) {
    http = new Http
    http.get(HTTP + path)
    await http.finalize()
    ttrue(http.status >= 400)
    ttrue(!http.response.contains('root:'))
    http.close()
}

//  A POST to an unregistered action is likewise not found, and does not execute anything
http = new Http
http.form(HTTP + '/action/nosuch', {a: 'x'})
await http.finalize()
teq(http.status, 404)
http.close()
