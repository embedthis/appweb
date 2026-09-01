/*
    framing-cgi.tst.ts - CGI and FastCGI must not forward a backend Transfer-Encoding

    #10003 hardened the shared HTTP/1 parser to reject any message declaring both Content-Length and
    Transfer-Encoding, and that transitively protected the reverse-proxy leg, whose backend response
    goes through the same client stack (framing-proxy.tst.ts). CGI and FastCGI each have their own
    hand-rolled response header parser and inherited none of it.

    Neither transport carries a chunk envelope: a CGI program writes to stdout and a FastCGI app
    writes records, and Appweb owns whatever framing reaches the client. So a backend's
    Transfer-Encoding is only ever a claim about a body it hands over flat. Forwarding it as an
    ordinary header, while the content-length branch had already forced chunkSize to zero, made
    Appweb *construct* a response carrying both headers with a raw, never-chunk-encoded body -- the
    RFC 9112 6.1 conflict #10003 exists to prevent, manufactured here rather than relayed. A client or
    cache following 9112 6.3 precedence frames the response by the Transfer-Encoding and desyncs from
    where Appweb believes it ends. Issue 10308.

    The response must be refused before any header is committed, whichever order the two arrive in.
 */

import {ttrue, teq, tget} from '@embedthis/testme'
import {chmodSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'
const TESTDIR = resolve(import.meta.dir, '..')
const CGIBIN = resolve(TESTDIR, 'cgi-bin')

/*
    There is no /bin/sh for a native Windows process, so the shell script below cannot run there and
    every case returned 404 -- which asserts nothing about framing. Batch is what appweb can start on
    a stock Windows machine, and ".bat" is in the cgiHandler extension list.
 */
const WINDOWS = process.platform == 'win32'
const EXT = WINDOWS ? '.bat' : ''

//  Write a CGI script emitting an exact header block, so both orderings can be expressed
function cgiScript(name: string, headers: string[]): string {
    let path = resolve(CGIBIN, name + EXT)

    if (WINDOWS) {
        /*
            "echo" appends CRLF, which is what a header line needs. The body must not have one: it
            would make the entity two bytes longer than the Content-Length the header declares, and
            the mismatch -- not the framing under test -- would be what the handler reported.
            "set /p" writes its argument with no line ending.

            The explicit exit is load bearing. Reading from nul leaves "set /p" with ERRORLEVEL 1, so
            the script inherits it and the CGI handler reports "Bad CGI process termination" -- a 502
            for every case, including the ones that must be served.
         */
        writeFileSync(path, [
            '@echo off',
            ...headers.map(h => `echo ${h}`),
            'echo.',
            '<nul set /p "=HELLO"',
            'exit /b 0',
            '',
        ].join('\r\n'))
        return path
    }
    writeFileSync(path, [
        '#!/bin/sh',
        ...headers.map(h => `printf '${h}\\r\\n'`),
        `printf '\\r\\n'`,
        `printf 'HELLO'`,
        '',
    ].join('\n'))
    chmodSync(path, 0o755)
    return path
}

async function get(path: string): Promise<Response> {
    return await fetch(`${HTTP}${path}`, {signal: AbortSignal.timeout(15000)})
}

mkdirSync(CGIBIN, {recursive: true})
let written: string[] = []

function scriptFor(name: string, headers: string[]): string {
    written.push(cgiScript(name, headers))
    return `/cgi-bin/${name}${EXT}`
}

try {
    //  Both framing headers, Content-Length first
    let response = await get(scriptFor('framing-cl-te', [
        'Content-Type: text/plain', 'Content-Length: 5', 'Transfer-Encoding: chunked']))
    teq(response.status, 502)
    ttrue(response.headers.get('Transfer-Encoding') == null)

    //  Both, the other way round -- the branch must not depend on which is seen first
    response = await get(scriptFor('framing-te-cl', [
        'Content-Type: text/plain', 'Transfer-Encoding: chunked', 'Content-Length: 5']))
    teq(response.status, 502)
    ttrue(response.headers.get('Transfer-Encoding') == null)

    /*
        Transfer-Encoding alone is refused too. Appweb owns the framing to the client, so a backend
        claim about a coding it did not apply is never actionable, with or without a Content-Length.
     */
    response = await get(scriptFor('framing-te', [
        'Content-Type: text/plain', 'Transfer-Encoding: chunked']))
    teq(response.status, 502)
    ttrue(response.headers.get('Transfer-Encoding') == null)

    //  Any value, not just "chunked"
    response = await get(scriptFor('framing-te-identity', [
        'Content-Type: text/plain', 'Transfer-Encoding: identity']))
    teq(response.status, 502)

    //  A Content-Length on its own is untouched, and the body still arrives intact
    response = await get(scriptFor('framing-cl', [
        'Content-Type: text/plain', 'Content-Length: 5']))
    teq(response.status, 200)
    teq(response.headers.get('Content-Length'), '5')
    ttrue(response.headers.get('Transfer-Encoding') == null)
    teq(await response.text(), 'HELLO')

    //  Neither header is the ordinary case and must be unaffected
    response = await get(scriptFor('framing-none', ['Content-Type: text/plain']))
    teq(response.status, 200)
    teq(await response.text(), 'HELLO')

    /*
        The FastCGI parser is a copy of the CGI one and carried the same defect, so it needs its own
        coverage rather than an argument by similarity. fastProgram -T emits Transfer-Encoding; it
        writes no Content-Length of its own, so this is the TE-only shape. The CL+TE orderings above
        cover the conflict itself.

        Not on Windows: the FastCGI handler is ME_UNIX_LIKE only, so <if FAST_MODULE> is false and the
        /fast-bin/ route does not exist, and fastProgram is a POSIX-only fixture that is not built
        there either. The CGI half above still runs, which is the half that can.
     */
    if (!WINDOWS) {
        response = await get('/fast-bin/fastProgram?SWITCHES=' + encodeURIComponent('-T'))
        teq(response.status, 502)
        ttrue(response.headers.get('Transfer-Encoding') == null)

        //  And a well behaved FastCGI response is still served
        response = await get('/fast-bin/fastProgram?SWITCHES=' + encodeURIComponent('-h 1'))
        teq(response.status, 200)
        teq(response.headers.get('X-FAST-0'), 'A loooooooooooooooooooooooong string')
    }

} finally {
    for (let path of written) {
        rmSync(path, {force: true})
    }
}
