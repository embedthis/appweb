/*
    Test FAST CGI HTTP redirection responses

    This test verifies that FAST programs can generate proper HTTP redirect
    responses with Location headers (302 Found status), and that a Location is used as given:
    template tokens and a leading "~" are not expanded into server paths.
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

// Test redirection with Location header
let http = new Http
http.followRedirects = false
http.get(HTTP + "/fast-bin/fastProgram?SWITCHES=-l%20/index.html")

await http.finalize()
ttrue(http.status == 302)
http.close()

const URL = HTTP.startsWith('http') ? HTTP : 'http://' + HTTP
const root = import.meta.dir.replace(/\/fast$/, '')
for (let [target, literal] of [
    ['/x?${DOCUMENTS}', '%7BDOCUMENTS%7D'],
    ['https://example.com/${HOME}', '%7BHOME%7D'],
    ['~/x', '~/x'],
]) {
    let res = await fetch(URL + '/fast-bin/fastProgram', {headers: {SWITCHES: '-l ' + target}, redirect: 'manual'})
    let location = res.headers.get('location') || ''
    teq(res.status, 302)
    if (!location.includes(literal) || location.includes(root)) {
        console.log(`Location for ${target}: ${location}`)
    }
    ttrue(location.includes(literal))
    ttrue(!location.includes(root))
}
