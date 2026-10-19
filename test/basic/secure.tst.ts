/*
    secure.tst.ts - HTTPS request handling
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {fetch} from '../ssl/tls'

const HTTP = 'http://' + (tget('TM_HTTP') || '127.0.0.1:4100').replace(/^https?:\/\//, '')
const HTTPS = tget('TM_HTTPS') || 'https://127.0.0.1:4443'

//  The plaintext endpoint serves the same document
let r = await fetch(HTTP + '/index.html')
teq(r.status, '200')
ttrue(r.body.startsWith('<html><head>'))

//  The secure endpoint serves it too
r = await fetch(HTTPS + '/index.html')
teq(r.status, '200')
ttrue(r.body.startsWith('<html><head>'))
ttrue(r.body.contains('<title>'))
ttrue(r.body.contains('</html>'))

//  Both endpoints return the same document byte for byte
let plain = await fetch(HTTP + '/index.html')
let secure = await fetch(HTTPS + '/index.html')
teq(secure.body, plain.body)

//  A query string is accepted over TLS and does not disturb the response
r = await fetch(HTTPS + '/index.html?a=b')
teq(r.status, '200')
ttrue(r.body.contains('</html>'))

//  POST over TLS
r = await fetch(HTTPS + '/index.html', {form: {data: 'Some data'}})
teq(r.status, '200')

//  Parameters posted over TLS reach the native parser, as they do in plaintext
r = await fetch(HTTPS + '/post', {form: {a: 'x', b: 'y'}})
teq(r.status, '200')
teq(r.body, 'name=[] address=[] data=[] a=[x] b=[y] c=[] q=[]')

//  The secure response carries the standard hardening headers
r = await fetch(HTTPS + '/index.html')
teq(r.headers['x-frame-options'], 'SAMEORIGIN')
teq(r.headers['x-content-type-options'], 'nosniff')
