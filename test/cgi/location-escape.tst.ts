/*
    location-escape.tst.ts - A CGI redirect target is HTML-escaped in the generated response body
 */

import {teq, ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

let response = await fetch(HTTP + '/cgi-bin/cgiProgram', {
    headers: {SWITCHES: '-l /a&lt;b'},
    redirect: 'manual',
})
let body = await response.text()
teq(response.status, 302)
ttrue((response.headers.get('location') || '').endsWith('/a&lt;b'))
if (!body.includes('/a&amp;lt;b"')) {
    console.log('redirect link does not carry the escaped target:\n' + body)
}
ttrue(body.includes('/a&amp;lt;b"'))


const root = import.meta.dir.replace(/\/cgi$/, '')
for (let [target, literal] of [
    ['/x?${DOCUMENTS}', '%7BDOCUMENTS%7D'],
    ['https://example.com/${HOME}', '%7BHOME%7D'],
    ['~/x', '~/x'],
]) {
    let res = await fetch(HTTP + '/cgi-bin/cgiProgram', {headers: {SWITCHES: '-l ' + target}, redirect: 'manual'})
    let location = res.headers.get('location') || ''
    teq(res.status, 302)
    if (!location.includes(literal) || location.includes(root)) {
        console.log(`Location for ${target}: ${location}`)
    }
    ttrue(location.includes(literal))
    ttrue(!location.includes(root))
}
