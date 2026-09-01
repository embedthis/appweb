/*
    chunked-end.tst.ts - The upload completes at the end of the body, not the end of the document

    The closing multipart boundary and the end of the request body are two different events, and with
    a chunked body they routinely arrive in separate reads: the client writes the document, then the
    terminating "0" chunk. The filter used to finish on the boundary and hand the handler an end
    packet there -- while rx->eof was still clear and remainingContent still positive -- so the
    handler read a well-formed upload as a truncated body, tore down its gateway and answered
    nothing. The client saw no response at all until its own inactivity timeout, 30 seconds later.

    Because it needed the two events in separate segments it reproduced only under load: cmd/http
    failed on CI roughly one run in ten and never locally. Writing the terminating chunk on its own
    makes it deterministic, which is the whole reason this file drives a socket.

    Both routes are here for the reason handlers.tst.ts gives: a gateway and a handler observe a
    refusal differently, and the gateway is the one that answered nothing.
 */

import {teq, ttrue} from '@embedthis/testme'

import {CGI_UPLOAD, payload, upload} from './multipart'

const BODY = payload(2048)

function parts(name: string) {
    return [
        {name: 'myfile', filename: name, contentType: 'text/plain', value: BODY},
        {name: 'field', value: 'chunked-end'},
    ]
}

//  cgiHandler -- the path that produced no response at all
let cgi = await upload(CGI_UPLOAD, parts('chunked-cgi.dat'), {chunked: true, marker: '</HTML>'})
teq(cgi.status, 200)
ttrue(cgi.text.includes('CGI_FILE_1_CLIENT_FILENAME=chunked-cgi.dat'))
ttrue(cgi.text.includes('CGI_FILE_1_SIZE=' + BODY.length))
ttrue(cgi.text.includes('PVAR field=chunked-end'))

//  actionHandler reports what the filter staged, so a premature end shows up as a missing file
let action = await upload('/action/upload', parts('chunked-action.dat'), {chunked: true, marker: 'FILES '})
teq(action.status, 200)
ttrue(action.text.includes('client=chunked-action.dat size=' + BODY.length))
ttrue(action.text.includes('PARAM field=chunked-end'))
ttrue(action.text.includes('FILES 1'))
