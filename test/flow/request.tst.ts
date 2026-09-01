/*
    request.tst.ts - Request flow control: a body written slowly, in small pieces

    The mirror of response.tst.ts, and the side the suite had nothing for. conn/delay.tst.ts is the
    closest thing and it delays only the request line and the headers -- it never sends a body, so no
    body parser has ever been asked to survive a boundary landing in an awkward place.

    That matters because every consumer of a request body reassembles it from packets: the upload
    filter searches for a boundary that may be divided across two of them, the chunk filter parses a
    size line that may be, and the gateways forward whatever they are given. A client library writes
    what it has in one call and never produces these cases; a real client on a slow link produces
    them constantly.

    Every case asserts the byte count the far end reports, not just the status. A body that arrives
    truncated still answers 200 -- the server has no way to know the client meant to send more when
    Content-Length was satisfied by a short count only because a piece was dropped.
 */

import {teq, tinfo, tskip, ttrue} from '@embedthis/testme'

import {slowWrite} from './slow'
import {buildBody, payload} from '../upload/multipart'
import {HAS_FAST, HAS_PROXY, NO_FAST, NO_PROXY} from '../utils/gateways'

//  Small enough that many pieces are needed, large enough to cross real packet boundaries
const BODY_SIZE = 24 * 1024
const PIECE = 300
const DELAY = 2

const CGI = '/cgiProgram.cgi?-p'
const FAST = '/fast-bin/fastProgram?SWITCHES=-p'
const PROXY = '/proxy/cgiProgram.cgi?-p'
const ACTION_UPLOAD = '/action/upload'

/*
    An opaque body type, not urlencoded. With a form type the CGI program decodes the body into
    parameters and prints those instead of the byte count -- so the count these cases exist to check
    would simply be absent, and "Post Data <n> bytes found" would never appear.
 */
const RAW = 'application/octet-stream'

//  Both gateway programs report what they read as "Post Data <n> bytes found"
function postedBytes(text: string): number {
    let m = text.match(/Post Data (\d+) bytes found/)
    return m ? parseInt(m[1], 10) : -1
}

const body = payload(BODY_SIZE)

/*
    A plain body to a CGI gateway, written in 300-byte pieces.

    The gateway is streamed the body as it arrives, so this is also the only case here where the
    child process is being fed while the client is still writing.
 */
let cgi = await slowWrite(CGI, body, {contentType: RAW, pieceSize: PIECE, pieceDelay: DELAY, maxPauses: 0, keepBody: true})
tinfo('  cgi            posted ' + postedBytes(cgi.text) + ' of ' + BODY_SIZE + ' bytes')
teq(cgi.status, 200)
teq(postedBytes(cgi.text), BODY_SIZE)

//  The same body to a FastCGI gateway
if (!HAS_FAST) {
    tskip('  fast           skipped: ' + NO_FAST)
} else {
    let fast = await slowWrite(FAST, body, {contentType: RAW, pieceSize: PIECE, pieceDelay: DELAY, maxPauses: 0, keepBody: true})
    tinfo('  fast           posted ' + postedBytes(fast.text) + ' of ' + BODY_SIZE + ' bytes')
    teq(fast.status, 200)
    teq(postedBytes(fast.text), BODY_SIZE)
}

/*
    And through the proxy, where the front server must forward pieces to the backend as they arrive
    rather than waiting for a body it has no idea the length of.
 */
if (!HAS_PROXY) {
    tskip('  proxy          skipped: ' + NO_PROXY)
} else {
    let proxy = await slowWrite(PROXY, body, {contentType: RAW, pieceSize: PIECE, pieceDelay: DELAY, maxPauses: 0, keepBody: true})
    tinfo('  proxy          posted ' + postedBytes(proxy.text) + ' of ' + BODY_SIZE + ' bytes')
    teq(proxy.status, 200)
    teq(postedBytes(proxy.text), BODY_SIZE)
}

/*
    Chunked, one chunk per piece. The chunk filter then sees a size line, its data and its terminating
    CRLF in separate reads -- the state it has to hold between packets, and the state a single-write
    client never exercises.
 */
let chunked = await slowWrite(CGI, body, {contentType: RAW, pieceSize: PIECE, pieceDelay: DELAY, chunked: true, maxPauses: 0, keepBody: true})
tinfo('  cgi chunked    posted ' + postedBytes(chunked.text) + ' of ' + BODY_SIZE + ' bytes')
teq(chunked.status, 200)
teq(postedBytes(chunked.text), BODY_SIZE)

/*
    A multipart upload written slowly. The upload filter's boundary search is the parser with the
    most state to lose across a packet edge: it retains a tail of boundaryLen+1 bytes on the theory
    that it may be the start of a boundary, and 300-byte pieces put a boundary across a read many
    times over in one request.
 */
const parts = [
    {name: 'myfile', filename: 'slow.dat', contentType: 'text/plain', value: payload(BODY_SIZE)},
    {name: 'field', value: 'slow-writer'},
]
let upload = await slowWrite(ACTION_UPLOAD, buildBody(parts), {
    contentType: 'multipart/form-data; boundary=----scenario-tests-boundary',
    pieceSize: PIECE, pieceDelay: DELAY, maxPauses: 0, keepBody: true,
})
tinfo('  upload         ' + (upload.text.match(/size=(\d+)/) || [])[1] + ' of ' + BODY_SIZE + ' bytes staged')
teq(upload.status, 200)
ttrue(upload.text.includes('client=slow.dat size=' + BODY_SIZE))
ttrue(upload.text.includes('PARAM field=slow-writer'))
ttrue(upload.text.includes('FILES 1'))

/*
    The same multipart body, chunked as well as dribbled -- both parsers holding state across the
    same packet edges at once. This is the combination a browser uploading a large file over a slow
    connection actually produces, and nothing in the suite had ever sent it.
 */
let both = await slowWrite(ACTION_UPLOAD, buildBody(parts), {
    contentType: 'multipart/form-data; boundary=----scenario-tests-boundary',
    pieceSize: PIECE, pieceDelay: DELAY, chunked: true, maxPauses: 0, keepBody: true,
})
tinfo('  upload chunked ' + (both.text.match(/size=(\d+)/) || [])[1] + ' of ' + BODY_SIZE + ' bytes staged')
teq(both.status, 200)
ttrue(both.text.includes('client=slow.dat size=' + BODY_SIZE))
ttrue(both.text.includes('PARAM field=slow-writer'))

/*
    A body written in single bytes. Slow, so it is small -- but it is the only shape that guarantees
    every parser sees every boundary divided, rather than relying on 300-byte pieces to land badly by
    chance.
 */
const TINY = 512
let byteAtATime = await slowWrite(CGI, payload(TINY), {contentType: RAW, pieceSize: 1, pieceDelay: 0, maxPauses: 0, keepBody: true})
tinfo('  cgi byte-wise  posted ' + postedBytes(byteAtATime.text) + ' of ' + TINY + ' bytes')
teq(byteAtATime.status, 200)
teq(postedBytes(byteAtATime.text), TINY)
