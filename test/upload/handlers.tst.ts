/*
    handlers.tst.ts - The same upload behind every handler that can carry the upload filter

    The suite had one upload route and it targeted a CGI program, so every property of the filter was
    verified behind cgiHandler and inferred for the rest. test/proxy.conf even configured
    "AddFilter uploadFilter" and a <Route ^/upload> that nothing ever requested.

    Each handler observes the upload differently, and the differences are the point:

      cgiHandler      FILE_<n>_* in the environment, synthesised by httpCreateCGIParams
      actionHandler   rx->files directly, via the /action/upload fixture
      fileHandler     nothing -- it serves its document. The staged file IS the evidence
      fastHandler     the urlencoded replay in the body, and the staged file. NOT the environment:
                      FCGI_PARAMS records go out when the request starts, before the filter has seen
                      a byte of the body, so no FILE_<n>_* variable can reach a FastCGI app
      proxyHandler    whatever the backend sees -- the front server forwards the multipart intact
      php via CGI     $_POST, and an empty $_FILES -- the filter consumed the body before PHP saw it
 */

import {teq, tinfo, tskip, ttrue} from '@embedthis/testme'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'

import {payload, upload} from './multipart'
import {HAS_FAST, HAS_PROXY, NO_FAST, NO_PROXY} from '../utils/gateways'
import {noInterpreter} from '../utils/interpreters'

const KEEP = resolve(import.meta.dir, '..', 'tmp', 'keep')
const BODY = payload(2048)

function staged(): string[] {
    try {
        return readdirSync(KEEP)
    } catch {
        return []
    }
}

function parts(name: string) {
    return [
        {name: 'myfile', filename: name, contentType: 'text/plain', value: BODY},
        {name: 'field', value: 'handler-matrix'},
    ]
}

//  cgiHandler -- the one path the suite already had, kept here so the matrix is complete in one file
let cgi = await upload('/upload/cgiProgram.cgi?-e+-p', parts('cgi.dat'), {marker: '</HTML>'})
teq(cgi.status, 200)
ttrue(cgi.text.includes('CGI_FILE_1_CLIENT_FILENAME=cgi.dat'))
ttrue(cgi.text.includes('CGI_FILE_1_SIZE=' + BODY.length))
ttrue(cgi.text.includes('PVAR field=handler-matrix'))

//  actionHandler
let action = await upload('/action/upload', parts('action.dat'), {marker: 'FILES '})
teq(action.status, 200)
ttrue(action.text.includes('client=action.dat size=' + BODY.length))
ttrue(action.text.includes('PARAM field=handler-matrix'))
ttrue(action.text.includes('FILES 1'))

/*
    fileHandler. The handler serves web/index.html and says nothing about the upload, so the staged
    file is the only evidence -- which is why this route runs with UploadAutoDelete off. Assert the
    file appeared AND that its size is the payload's: a zero-byte temp file would otherwise read as a
    successful upload.
 */
let before = staged()
let file = await upload('/upload-file/index.html', parts('file.dat'), {marker: '</html>'})
teq(file.status, 200)
ttrue(file.text.includes('Hello /index'))
let after = staged()
teq(after.length, before.length + 1)
let added = after.filter(f => !before.includes(f))
teq(added.length, 1)
teq(Bun.file(resolve(KEEP, added[0])).size, BODY.length)

/*
    fastHandler. -p prints the posted body, which is the filter's urlencoded replay: seeing
    "field=handler-matrix" rather than a multipart boundary is what proves the filter ran in front of
    the gateway.

    The environment is asserted NOT to carry the file variables. That is a real property of FastCGI
    and not a defect to be fixed here -- params precede the body on the wire -- but it is exactly the
    kind of thing that gets "corrected" by someone who has only ever seen the CGI case, so it is
    pinned with its reason.
 */
if (!HAS_FAST) {
    tskip('fastHandler case skipped: ' + NO_FAST)
} else {
    before = staged()
    let fast = await upload('/fast-upload/fastProgram?SWITCHES=-e+-p', parts('fast.dat'), {marker: '</HTML>'})
    teq(fast.status, 200)
    ttrue(fast.text.includes('field=handler-matrix'))
    ttrue(!fast.text.includes('multipart/form-data', fast.text.indexOf('Post Data')))
    ttrue(!fast.text.includes('FILE_1_SIZE'))
    after = staged()
    teq(after.length, before.length + 1)
    added = after.filter(f => !before.includes(f))
    teq(Bun.file(resolve(KEEP, added[0])).size, BODY.length)
}

/*
    proxyHandler. The front server's ^/proxy/ route resets its pipeline and carries no upload filter,
    so the multipart body must cross to the backend byte for byte; the backend's own filter is what
    stages it. A front server that mangled the body -- re-chunked it, dropped the epilog, rewrote the
    content type -- would fail here and nowhere else in the suite.
 */
if (!HAS_PROXY) {
    tskip('proxyHandler case skipped: ' + NO_PROXY)
} else {
    let proxy = await upload('/proxy/upload/cgiProgram.cgi?-e+-p', parts('proxy.dat'), {marker: '</HTML>'})
    teq(proxy.status, 200)
    ttrue(proxy.text.includes('CGI_FILE_1_CLIENT_FILENAME=proxy.dat'))
    ttrue(proxy.text.includes('CGI_FILE_1_SIZE=' + BODY.length))
    ttrue(proxy.text.includes('PVAR field=handler-matrix'))
}

/*
    PHP through CGI, via the Action directive.

    The expectation is deliberately about $_FILES being EMPTY: appweb's filter consumes the multipart
    body and replays it as urlencoded, so PHP sees the fields in $_POST and no uploaded file at all.
    That is the documented trade -- test/appweb.conf carries a commented "StreamInput
    multipart/form-data /php/upload" for deployments that want PHP to do its own parsing -- and it is
    worth pinning, because an integrator who expects $_FILES to be populated will otherwise find out
    in production.

    That Action selects an interpreter at all is cgi/action.tst.ts; this case is about what the
    upload filter leaves for it to see.
 */
let noPhp = noInterpreter('php-cgi')
if (noPhp) {
    tskip('PHP case skipped: ' + noPhp)
} else {
    let reply = await upload('/php-upload/upload.php', parts('php.dat'), {marker: '</pre>'})
    teq(reply.status, 200)
    ttrue(reply.text.includes('_POST'))
    ttrue(reply.text.includes('handler-matrix'))
    //  The filter consumed the body, so PHP's own multipart parser has nothing to find
    ttrue(reply.text.includes('_FILES=>Array\n(\n)'))
}

tinfo('handler matrix complete; tmp/keep holds ' + staged().length + ' staged file(s)')
