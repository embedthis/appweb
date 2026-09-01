/*
    boundary.tst.ts - Every documented rejection path in the upload filter

    Before this file the suite sent only well-formed multipart bodies, so every refusal in
    uploadFilter.c was unverified: a build that accepted a missing boundary, a truncated document, a
    disposition naming a file before its field, or a client filename containing "../" would have
    passed the whole suite.

    Writing it turned up #10367, since fixed, and the shape of that defect is why this file is
    organised the way it is. A refusal used to behave differently depending on the handler downstream
    of the filter:

        cgiHandler      no response at all, connection held open
        fileHandler     400, connection held open
        actionHandler   400, connection held open

    Running the cases against one route only would have hidden half of that -- and did, until the
    filename cases happened to use the file route and came back with a status the gateway cases never
    produced. So the structural cases still run against BOTH a gateway route and a handler route, and
    must go on doing so: the divergence was invisible from either side alone.

    Each refusal is checked for two properties, not one: that it was refused, and that nothing was
    staged. A filter that refuses the request after having already written the attacker's bytes to
    the upload directory has not refused anything that matters.
 */

import {teq, tinfo, ttrue} from '@embedthis/testme'
import {readdirSync} from 'node:fs'
import {resolve} from 'node:path'

import {BOUNDARY, CGI_UPLOAD, buildBody, payload, sendBody, upload} from './multipart'

//  The one upload directory in the configuration that keeps its files (UploadAutoDelete off), and
//  nothing else writes there -- so counting it before and after a request to /upload-file is exact.
const KEEP = resolve(import.meta.dir, '..', 'tmp', 'keep')

const FILE_UPLOAD = '/upload-file/index.html'
const ACTION_UPLOAD = '/action/upload'

function staged(): number {
    try {
        return readdirSync(KEEP).length
    } catch {
        return -1
    }
}

/*
    Assert a refusal. Three properties, all of which must hold.

      - A 4xx reaches the client. A class rather than a literal, because the filter answers 400 for a
        malformed document and 413 for one over a limit, and pinning a literal would make this test
        about the status code rather than about the refusal.
      - The connection closes. RFC 9112 6.1: server and client have provably disagreed about the
        message, so the connection cannot safely carry another one.
      - Nothing was staged. A filter that answers 400 having already written the attacker's bytes to
        the upload directory has refused nothing that matters.

    All three were asserted the other way round until #10367 was fixed. Behind a gateway the client
    received nothing at all, and on every handler the connection was held to the route's
    InactivityTimeout -- so this file pinned status 0 and "not closed" and carried the replacement
    assertions in this comment. They are now the assertions. The history is worth keeping because it
    is why the structural cases below still run against both a gateway route and a handler route:
    the two answered differently, and running against one only is what hid half the defect.
 */
async function refused(name: string, path: string, body: string, options: any = {}): Promise<void> {
    let before = staged()
    //  No marker: read to EOF, so the close is observed rather than inferred
    let reply = await sendBody(path, body, {timeout: 5000, ...options})

    if (reply.status < 400 || reply.status >= 500) {
        console.log(name + ' [' + path + ']: expected a 4xx, got ' + reply.status + '\n' +
            reply.text.slice(0, 400))
    }
    ttrue(reply.status >= 400 && reply.status < 500)

    if (!reply.closed) {
        console.log(name + ' [' + path + ']: refused the upload but did not close the connection')
    }
    ttrue(reply.closed)

    if (staged() != before) {
        console.log(name + ' [' + path + ']: the refused upload left a file in tmp/keep')
    }
    teq(staged(), before)
}

//  Refuse the same body on a gateway route and a handler route. They answered differently before
//  #10367 was fixed, and that is exactly the divergence a single-route test would let back in.
async function refusedBoth(name: string, body: string, options: any = {}): Promise<void> {
    await refused(name, CGI_UPLOAD, body, options)
    await refused(name, ACTION_UPLOAD, body, options)
}

/*
    A well-formed upload every route accepts, so a refusal below is about the malformed body and not
    about the route, the fixture or the helper.
 */
let control = await upload(CGI_UPLOAD, [
    {name: 'myfile', filename: 'control.dat', contentType: 'text/plain', value: payload(64)},
])
teq(control.status, 200)
ttrue(control.text.includes('CGI_FILE_1_CLIENT_FILENAME=control.dat'))
ttrue(control.text.includes('CGI_FILE_1_SIZE=64'))

let actionControl = await upload(ACTION_UPLOAD, [
    {name: 'myfile', filename: 'control.dat', contentType: 'text/plain', value: payload(64)},
    {name: 'field', value: 'plain-value'},
], {marker: 'FILES '})
teq(actionControl.status, 200)
ttrue(actionControl.text.includes('FILE 1 name=myfile client=control.dat size=64 type=text/plain'))
ttrue(actionControl.text.includes('PARAM field=plain-value'))
ttrue(actionControl.text.includes('FILES 1'))

/*
    A Content-Type with no boundary= parameter at all. allocUpload() has nothing to search for and
    must refuse rather than treat the whole body as one anonymous part.
 */
await refusedBoth('missing boundary', buildBody([{name: 'f', filename: 'a.dat', value: 'data'}]),
    {contentType: 'multipart/form-data'})

//  boundary= present but empty
await refusedBoth('empty boundary', buildBody([{name: 'f', filename: 'a.dat', value: 'data'}]),
    {contentType: 'multipart/form-data; boundary='})

/*
    A boundary longer than MAX_BOUNDARY (512). The check exists so a boundary cannot be used to force
    unbounded per-request state, and nothing exercised it.
 */
const LONG = 'b'.repeat(600)
await refusedBoth('oversized boundary', buildBody([{name: 'f', filename: 'a.dat', value: 'data'}], LONG),
    {boundary: LONG})

//  A boundary just inside the limit is accepted, so the case above is about the limit and not about
//  long boundaries in general.
const NEAR = 'b'.repeat(400)
let near = await upload(CGI_UPLOAD, [
    {name: 'myfile', filename: 'near.dat', contentType: 'text/plain', value: payload(32)},
], {boundary: NEAR})
teq(near.status, 200)
ttrue(near.text.includes('CGI_FILE_1_SIZE=32'))

/*
    A quoted boundary. RFC 2046 permits it and allocUpload() strips the quotes; nothing asserted that
    it does, so a build that kept them would match no boundary in the body and fail every upload from
    a client that quotes.
 */
let quoted = await upload(CGI_UPLOAD, [
    {name: 'myfile', filename: 'quoted.dat', contentType: 'text/plain', value: payload(48)},
], {contentType: 'multipart/form-data; boundary="' + BOUNDARY + '"'})
teq(quoted.status, 200)
ttrue(quoted.text.includes('CGI_FILE_1_SIZE=48'))

/*
    A body with no closing "--boundary--". Complete on the wire, incomplete as a multipart document:
    incomingUploadService reaches the end packet in a state other than CONTENT_END and must say so.
 */
await refusedBoth('unterminated document',
    buildBody([{name: 'f', filename: 'a.dat', value: payload(128)}], BOUNDARY, false))

/*
    A disposition carrying filename= before name=. processUploadHeader parses the pairs in order and
    refuses, because a file part with no field name has nowhere to report itself.
 */
await refusedBoth('filename before name', buildBody([{
    raw: 'Content-Disposition: form-data; filename="early.dat"; name="f"\r\n\r\n' + payload(32),
}]))

//  A file part with no name at all
await refusedBoth('file part with no name', buildBody([{filename: 'anon.dat', value: payload(32)}]))

/*
    SR-11: the client filename policy. Each of these must be refused and must leave nothing behind.

    Run against /upload-file, whose route stages into tmp/keep with UploadAutoDelete off. That is
    what makes the staged() check real here rather than vacuous: if the sanitiser ever admits one of
    these, the file survives the request and the count moves.

    The traversal shapes are the reason the policy exists. A leading dot is refused by its own branch
    and the rest by validUploadChars(), so ".hidden.dat" and "../escape.dat" fail differently and
    both are pinned.
 */
const BAD_NAMES = [
    '../escape.dat',
    '..\\escape.dat',
    '/absolute.dat',
    'sub/dir.dat',
    'back\\slash.dat',
    '.hidden.dat',
    '.',
    '..',
    'quote"name.dat',
]
for (let name of BAD_NAMES) {
    await refused('client filename "' + name + '"', FILE_UPLOAD,
        buildBody([{name: 'myfile', filename: name, contentType: 'text/plain', value: payload(32)}]))
}

/*
    And the shapes the policy admits, so the block above is about the refused characters rather than
    about filenames generally. validUploadChars() allows the URI sub-delimiters and a space.

    Asserted through the action route, not the CGI one, because the CGI environment is not a faithful
    view of the filename: the ^/upload/ route is defined before the CGI block in appweb.conf, so it
    does not inherit "CgiEscape off" and its environment is shell-escaped. That turns "tilde~plus+"
    into "tilde\~plus+", which is correct escaping and nothing to do with the filename policy under
    test here. The action fixture prints what the filter recorded.
 */
const GOOD_NAMES = ['plain.dat', 'with space.dat', 'dash-under_score.dat', 'a.b.c.dat', 'tilde~plus+.dat']
for (let name of GOOD_NAMES) {
    let ok = await upload(ACTION_UPLOAD, [
        {name: 'myfile', filename: name, contentType: 'text/plain', value: payload(16)},
    ], {marker: 'FILES '})
    if (ok.status != 200) {
        console.log('client filename "' + name + '" should be accepted, got ' + ok.status)
    }
    teq(ok.status, 200)
    if (!ok.text.includes('client=' + name + ' size=16')) {
        console.log('client filename "' + name + '" came back as:\n' + ok.text.slice(0, 300))
    }
    ttrue(ok.text.includes('client=' + name + ' size=16'))
}

/*
    A bare newline inside the filename never reaches the filename policy, and that is worth pinning
    rather than assuming.

    validUploadChars() excludes '\n', so this looks like it belongs in BAD_NAMES -- but it never gets
    there. getNextUploadToken() splits the part headers on newlines first, so the disposition line
    ends at the newline, the filename is the truncated "new" with no closing quote, and the remainder
    ("line.dat\"") is parsed as a further part header and ignored because it names nothing the filter
    honours. The upload is accepted.

    Asserted here as observed. The reachable consequence is a truncated client filename: a filename
    can inject a part header, but the only one that would be honoured is Content-Type, which the
    client sets directly anyway. Nothing new is reachable, so this is not filed -- but a change in it
    should be visible, because a build that started passing '\n' through to mprNormalizePath would be
    a different matter entirely.
 */
let newline = await upload(ACTION_UPLOAD, [
    {name: 'f', filename: 'new\nline.dat', contentType: 'text/plain', value: payload(5)},
], {marker: 'FILES '})
teq(newline.status, 200)
ttrue(newline.text.includes('client=new size=5'))
ttrue(!newline.text.includes('line.dat'))

/*
    A preamble before the first boundary and an epilog after the terminator. RFC 2046 5.1.1 requires
    both to be discarded, and the filter's CONTENT_END branch does discard the epilog -- but nothing
    sent one, so a build that fed either into the file would have passed.
 */
let framed = await sendBody(CGI_UPLOAD,
    'This is a preamble a conforming reader must ignore.\r\n' +
    buildBody([{name: 'myfile', filename: 'framed.dat', contentType: 'text/plain', value: payload(64)}]) +
    'And this is an epilog.\r\n', {marker: '</HTML>'})
teq(framed.status, 200)
ttrue(framed.text.includes('CGI_FILE_1_CLIENT_FILENAME=framed.dat'))
ttrue(framed.text.includes('CGI_FILE_1_SIZE=64'))

/*
    Several parts in one request. The file numbering is 1-based and must not collapse two files onto
    one index -- which is what a test sending a single file can never notice.
 */
let many = await upload(CGI_UPLOAD, [
    {name: 'first', filename: 'one.dat', contentType: 'text/plain', value: payload(10)},
    {name: 'second', filename: 'two.dat', contentType: 'text/plain', value: payload(20)},
    {name: 'third', filename: 'three.dat', contentType: 'text/plain', value: payload(30)},
    {name: 'field', value: 'plain-value'},
])
teq(many.status, 200)
ttrue(many.text.includes('CGI_FILE_1_SIZE=10'))
ttrue(many.text.includes('CGI_FILE_2_SIZE=20'))
ttrue(many.text.includes('CGI_FILE_3_SIZE=30'))
ttrue(many.text.includes('CGI_FILE_3_CLIENT_FILENAME=three.dat'))
ttrue(many.text.includes('PVAR field=plain-value'))

/*
    The refusal is prompt, which is the half of #10367 that was a resource problem rather than a
    diagnostic one.

    A refused upload used to occupy a connection slot until the route's InactivityTimeout -- two
    minutes on ^/upload/ -- for the cost of one small write. It now closes immediately. Asserting a
    bound on the time is what distinguishes "closed" from "closed eventually": a regression that
    reinstated the hold would still close, once the timeout expired, and every other assertion in
    this file would still pass.
 */
let mark = Date.now()
let held = await sendBody(ACTION_UPLOAD, buildBody([{name: 'f', filename: 'a.dat', value: 'data'}]),
    {contentType: 'multipart/form-data', timeout: 30000})
let elapsed = Date.now() - mark
tinfo('a refused upload was answered and closed in ' + elapsed + 'ms')
if (!held.closed || elapsed > 2000) {
    console.log('The refused upload took ' + elapsed + 'ms to close (closed ' + held.closed +
        ', status ' + held.status + '). #10367 held the connection to the InactivityTimeout.')
}
ttrue(held.closed)
ttrue(elapsed < 2000)
ttrue(held.status >= 400 && held.status < 500)

tinfo('upload directory tmp/keep holds ' + staged() + ' staged file(s) after the ratchet')
