/*
    query.tst.ts - Native query string parsing

    Query parameters are parsed by http/src/var.c and exposed as ${param:...}. The /post
    route writes them straight back, so this observes the parser the whole server uses rather
    than the CGI environment, which cgi/query.tst.ts covers separately.

    Was previously gated on thas('ME_EJS') against a form.ejs endpoint. Ejscript is not part of
    Appweb, the flag is exported by nothing, and no .ejs document is served -- so the whole file
    skipped silently and query-string parsing had no coverage at all (10061).

    Note: "Target write" HTML-escapes its expansion, so a reflected "&" arrives as "&amp;".
    That is a reflected-XSS defence and is asserted deliberately below, not worked around.
 */

import {teq, tget} from '@embedthis/testme'
import {Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Parameters with no value. Each key must be present and parse to the empty string
http.get(HTTP + '/post?a&b&c')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[] b=[] c=[] q=[a&amp;b&amp;c]')
http.close()

//  Parameters with values
http.get(HTTP + '/post?a=x&b=y&c=z')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[x] b=[y] c=[z] q=[a=x&amp;b=y&amp;c=z]')
http.close()

//  A mix of valued and valueless keys in one query
http.get(HTTP + '/post?a=x&b&c=z')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[x] b=[] c=[z] q=[a=x&amp;b&amp;c=z]')
http.close()

//  Percent-encoded values decode exactly once. ${request:query} is the undecoded original
http.get(HTTP + '/post?a=one%20two&b=%2Fslash&c=%25')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[one two] b=[/slash] c=[%] q=[a=one%20two&amp;b=%2Fslash&amp;c=%25]')
http.close()

//  "+" in a query value is a space
http.get(HTTP + '/post?a=one+two')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[one two] b=[] c=[] q=[a=one+two]')
http.close()

//  No query string at all leaves every parameter absent
http.get(HTTP + '/post')
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[] b=[] c=[] q=[]')
http.close()

/*
    Reflected metacharacters are HTML-escaped on the way out. A query that would otherwise
    close the surrounding markup must not survive into the response as live syntax.
 */
http.get(HTTP + '/post?a=' + encodeURIComponent('<script>alert(1)</script>'))
await http.finalize()
teq(http.status, 200)
teq(http.response, 'name=[] address=[] data=[] a=[&lt;script&gt;alert(1)&lt;/script&gt;] b=[] c=[] q=[a=%3Cscript%3Ealert(1)%3C%2Fscript%3E]')
http.close()
