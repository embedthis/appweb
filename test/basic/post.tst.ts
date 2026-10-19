/*
    post.tst.ts - Native POST body handling
 */

import {teq, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  A raw (non-form) body is accepted by the file handler
http.post(HTTP + "/index.html", "Some data")
await http.finalize()
teq(http.status, 200)
http.close()

//  An empty body is a valid POST
http.post(HTTP + "/index.html", "")
await http.finalize()
teq(http.status, 200)
http.close()

//  Form-encoded keys reach the native parameter parser
http.form(HTTP + '/post', {a: 'John', b: '700 Park Ave', c: 'z'})
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[John] b=[700 Park Ave] c=[z] q=[]')
http.close()

//  A form value containing the separator characters survives decoding intact
http.form(HTTP + '/post', {a: 'x&y', b: 'p=q', c: 'one two'})
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[x&amp;y] b=[p=q] c=[one two] q=[]')
http.close()

//  Query and body parameters are both parsed, and do not collide when keys differ
http.form(HTTP + '/post?a=fromQuery', {b: 'fromBody'})
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[fromQuery] b=[fromBody] c=[] q=[a=fromQuery]')
http.close()

//  A form-encoded body with a valueless key parses to the empty string, as in a query
http = new Http
http.setHeader('Content-Type', 'application/x-www-form-urlencoded')
http.post(HTTP + '/post', 'a&b=y')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[] b=[y] c=[] q=[]')
http.close()
