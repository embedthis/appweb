/*
    sizes.tst.ts - Upload size sweep, boundaries straddling a write, and the per-file cap

    Three properties the suite never checked.

    SIZE. stress/upload.tst.ts sends one large file and cmd/http.tst.ts sends whatever files happen
    to sit in test/cmd, so the small end was covered by accident and the interesting sizes not at
    all. Zero bytes, one byte, and a part shorter than the boundary all take different paths through
    processUploadData: the "size < boundaryLen -- return and get more data" early exit is reached by
    a short part and by nothing else.

    STRADDLE. The filter must handle a boundary divided across two reads. That is the
    "size - (boundaryLen - 1 + 2)" retention: when no boundary is visible it writes all but the last
    boundaryLen+1 bytes and keeps the remainder, on the theory that the tail may be the start of a
    boundary. Nothing exercised it, because a client library writes a small body in one call.

    LIMIT (SR-12). LimitUpload caps a single uploaded file. The ^/upload-limit/ route sets 2K so the
    refusal costs kilobytes rather than the 4GB the other routes allow.
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'

import {BOUNDARY, CGI_UPLOAD, buildBody, closingBoundaryOffset, payload, sendBody, upload} from './multipart'

const KEEP = resolve(import.meta.dir, '..', 'tmp', 'keep')
const ACTION_UPLOAD = '/action/upload'
const LIMIT_UPLOAD = '/upload-limit/cgiProgram.cgi?-e'
const FILE_UPLOAD = '/upload-file/index.html'

function staged(): string[] {
    try {
        return readdirSync(KEEP)
    } catch {
        return []
    }
}

/*
    SIZE SWEEP.

    Sizes chosen against the boundary length rather than as round numbers, because that is what the
    code branches on. BOUNDARY is 27 characters and the filter searches for "--" + boundary, so 29 is
    the length that matters: a part shorter than that cannot contain a boundary and takes the early
    return, a part longer than it cannot avoid the boundary search.

    Asserted through the action fixture, which reports the size the filter recorded. A truncated or
    over-long upload shows here as a wrong number, which a status code never would.
 */
const SIZES = [0, 1, 2, 27, 28, 29, 30, 100, 1023, 1024, 1025, 4095, 4096, 8192, 65536]
for (let size of SIZES) {
    let reply = await upload(ACTION_UPLOAD, [
        {name: 'myfile', filename: 'size-' + size + '.dat', contentType: 'text/plain', value: payload(size)},
    ], {marker: 'FILES '})
    if (reply.status != 200 || !reply.text.includes('client=size-' + size + '.dat size=' + size)) {
        console.log('upload of ' + size + ' bytes: status ' + reply.status + '\n' + reply.text.slice(0, 300))
    }
    teq(reply.status, 200)
    ttrue(reply.text.includes('client=size-' + size + '.dat size=' + size))
    ttrue(reply.text.includes('FILES 1'))
}

/*
    A zero-byte part still produces a file entry rather than being silently dropped. Asserted
    separately from the sweep above because "size=0" and "no file at all" are easy to confuse when
    scanning output, and only one of them is correct.
 */
let empty = await upload(ACTION_UPLOAD, [
    {name: 'myfile', filename: 'empty.dat', contentType: 'text/plain', value: ''},
], {marker: 'FILES '})
teq(empty.status, 200)
ttrue(empty.text.includes('FILE 1 name=myfile client=empty.dat size=0'))
ttrue(empty.text.includes('FILES 1'))

//  A part carrying only the two bytes that begin a boundary, so the retention arithmetic sees a tail
//  that looks like the start of one and must not treat it as such
let dashes = await upload(ACTION_UPLOAD, [
    {name: 'myfile', filename: 'dashes.dat', contentType: 'text/plain', value: '--'},
], {marker: 'FILES '})
teq(dashes.status, 200)
ttrue(dashes.text.includes('client=dashes.dat size=2'))

//  And a part whose content is the boundary text without its leading "--", which must be data
let looksLike = await upload(ACTION_UPLOAD, [
    {name: 'myfile', filename: 'lookalike.dat', contentType: 'text/plain', value: BOUNDARY},
], {marker: 'FILES '})
teq(looksLike.status, 200)
ttrue(looksLike.text.includes('client=lookalike.dat size=' + BOUNDARY.length))

/*
    STRADDLE.

    The same body sent two ways: in one write, and split so the last two bytes of the closing
    boundary land in the second write. The assertion is that they agree -- not that some internal
    state was reached.

    That choice is deliberate. Write boundaries are not guaranteed to survive the network stack, so a
    test asserting "the filter took the split path" would be asserting something it cannot observe
    and cannot guarantee it caused. Equality with the unsplit control is true however the packets
    actually land, and still fails if the split path corrupts or truncates.

    The delay between the two writes is what makes the split likely rather than theoretical: without
    it the kernel coalesces them into one segment and the test silently becomes a duplicate of the
    control.
 */
const STRADDLE_SIZE = 3000
const straddleParts = [
    {name: 'myfile', filename: 'straddle.dat', contentType: 'text/plain', value: payload(STRADDLE_SIZE)},
    {name: 'field', value: 'straddle'},
]
const straddleBody = buildBody(straddleParts)
const closing = closingBoundaryOffset(straddleBody)
ttrue(closing > 0)

/*
    Two things in the reply necessarily differ between two requests: the staged temp file's name,
    which carries a pid and a per-request counter, and the Date header, whose resolution is one
    second. The split request is deliberately slower than the control -- it waits pieceDelay between
    writes -- so the pair straddles a second boundary often enough to matter, and did on CI. Both are
    normalised away; everything left is a property of the parsed upload and must not differ. That is
    what lets this be an exact equality rather than a handful of substring checks that would each
    have to be remembered and kept in step.
 */
function normalize(text: string): string {
    return text.replace(/appweb-\d+-\d+-\d+\.tmp/g, 'TMPFILE')
               .replace(/^Date: .*$/gm, 'Date: DATE')
}

let whole = await sendBody(ACTION_UPLOAD, straddleBody, {marker: 'FILES '})
teq(whole.status, 200)
ttrue(whole.text.includes('client=straddle.dat size=' + STRADDLE_SIZE))

//  Split so the write ends two bytes into "--boundary--", dividing the boundary itself
let split = await sendBody(ACTION_UPLOAD, straddleBody, {splitAt: closing + 2, pieceDelay: 60, marker: 'FILES '})
if (normalize(split.text) != normalize(whole.text)) {
    console.log('split-boundary upload differed from the unsplit control:\nsplit:\n' +
        split.text.slice(0, 400) + '\nwhole:\n' + whole.text.slice(0, 400))
}
teq(split.status, whole.status)
teq(normalize(split.text), normalize(whole.text))

//  And split in the middle of the file data, which is the ordinary multi-packet case
let dribbled = await sendBody(ACTION_UPLOAD, straddleBody, {pieceSize: 512, pieceDelay: 5, marker: 'FILES '})
teq(dribbled.status, 200)
ttrue(dribbled.text.includes('client=straddle.dat size=' + STRADDLE_SIZE))
ttrue(dribbled.text.includes('PARAM field=straddle'))

/*
    SR-12: LimitUpload.

    Under the cap is accepted, over it is refused, and -- the half that matters -- the oversized file
    does not survive. writeToFile() compares the running total before each write, so a file at the
    cap has been written and one over it has not; the refusal must not leave the excess on disk.

    The refusal path here is httpLimitError with HTTP_CLOSE, which unlike the bad-request refusals in
    boundary.tst.ts does reach the client: a real 413, and the connection closes. That contrast is
    the evidence in #10367 that the missing flag is what breaks the others, so it is asserted rather
    than assumed.
 */
let under = await upload(LIMIT_UPLOAD, [
    {name: 'myfile', filename: 'under.dat', contentType: 'text/plain', value: payload(1024)},
], {marker: '</HTML>'})
teq(under.status, 200)
ttrue(under.text.includes('CGI_FILE_1_SIZE=1024'))

let before = staged()
let over = await sendBody(LIMIT_UPLOAD, buildBody([
    {name: 'myfile', filename: 'over.dat', contentType: 'text/plain', value: payload(8192)},
]), {timeout: 5000})
teq(over.status, 413)
ttrue(over.closed)
teq(staged().length, before.length)

/*
    LimitUpload is enforced twice over, and the second one is easy to miss.

    writeToFile() bounds a single file: "file->size + len > limits->uploadSize". Read alone, that
    says the cap is per file and a request carrying many files under it should be accepted. It is
    not -- tailFilter.c also compares the cumulative body count against the same limit
    ("rx->upload && count >= limits->uploadSize"), which is the cap #10313 added. So LimitUpload
    bounds the request as well as the file, and the request-level comparison is against the whole
    body including part headers and boundaries, not just file content.

    Both halves are asserted. Two 512-byte parts fit under 2K with their overhead and are accepted;
    two 1000-byte parts are each well under the per-file cap and are refused, which can only be the
    cumulative check.
 */
let twoSmall = await upload(LIMIT_UPLOAD, [
    {name: 'first', filename: 'a.dat', contentType: 'text/plain', value: payload(512)},
    {name: 'second', filename: 'b.dat', contentType: 'text/plain', value: payload(300)},
], {marker: '</HTML>'})
teq(twoSmall.status, 200)
ttrue(twoSmall.text.includes('CGI_FILE_1_SIZE=512'))
ttrue(twoSmall.text.includes('CGI_FILE_2_SIZE=300'))

let twoUnder = await sendBody(LIMIT_UPLOAD, buildBody([
    {name: 'first', filename: 'a.dat', contentType: 'text/plain', value: payload(1000)},
    {name: 'second', filename: 'b.dat', contentType: 'text/plain', value: payload(1000)},
]), {timeout: 5000})
teq(twoUnder.status, 413)
ttrue(twoUnder.closed)

/*
    A large upload through the file route, staged and kept, so the byte count is checked against the
    file system rather than against a number the server reported about itself.
 */
const BIG = 256 * 1024
before = staged()
let big = await upload(FILE_UPLOAD, [
    {name: 'myfile', filename: 'big.dat', contentType: 'application/octet-stream', value: payload(BIG)},
], {marker: '</html>'})
teq(big.status, 200)
let added = staged().filter(f => !before.includes(f))
teq(added.length, 1)
teq(Bun.file(resolve(KEEP, added[0])).size, BIG)

tinfo('size sweep complete: ' + SIZES.length + ' sizes, straddle at offset ' + closing +
      ', ' + staged().length + ' file(s) staged in tmp/keep')
