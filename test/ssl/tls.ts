/*
    tls.ts - TLS request helpers for the ssl test group

    The Ejscript Http client is built without TLS (Config.SSL is false), so it cannot exercise any of
    this. Tests that gated on it reported PASS while asserting nothing, which is indistinguishable
    from coverage in the summary line -- see issue 10047.

    get() drives openssl s_client, the same way ssl/revoke.tst.ts drives utils/tls-probe.sh.

    It used to drive curl, and could not run on Windows at all. Every curl on a Windows machine is
    built against Schannel -- the one Git for Windows ships and the one in System32 both -- and
    Schannel validates only against the Windows certificate store: it ignores --cacert, so
    "curl --cacert ca.crt https://localhost:4443/" fails with exit 60 before a client certificate is
    even in the picture, and it cannot import a PEM client certificate at all. Since every assertion
    in this group either verifies the server against the test CA or presents a client certificate, the
    whole group failed for a reason that had nothing to do with the server. openssl is present on all
    three platforms, takes PEM directly, and revoke.tst.ts already proved the approach here.

    Every helper returns a status string rather than throwing, so a test distinguishes "the server
    refused this handshake" from "the command failed", and a refusal is asserted rather than inferred
    from an exception.
 */

import {Cmd, Path} from '@embedthis/ejscript'

//  Certificate material lives in the certs directory beside test/
const certs = new Path(import.meta.dir).dirname.dirname.join('certs')

export function cert(name: string): string {
    return certs.join(name).toString()
}

//  Single-quote for sh. Certificate paths are ours, but a path with a space must still survive.
function quote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'"
}

/*
    Issue one HTTPS GET and return the HTTP status as a string, or "FAIL[reason]" when the request was
    not served. The reason distinguishes the cases a test needs to tell apart:

        FAIL[absent]        nothing is listening
        FAIL[<alert>]       the peer sent a TLS alert, named -- a refused client certificate reads
                            differently from a protocol failure
        FAIL[verify]        the server certificate did not validate against the CA given
        FAIL[error]         anything else

    opts:
      ca          verify the server against this CA bundle
      insecure    do not verify the server
      clientCert  client certificate, PEM
      key         its private key, PEM
 */
export async function get(url: string, opts: any = {}): Promise<string> {
    let target = new URL(url)
    let host = target.hostname
    let path = (target.pathname || '/') + (target.search || '')

    /*
        HTTP/1.0 so the server closes when the response is complete. -quiet implies -ign_eof, so
        s_client waits for that close rather than for the end of its own input; a kept-alive
        connection would stall until a timeout.
     */
    let out = await sclient(url, opts, `printf 'GET ${path} HTTP/1.0\\r\\nHost: ${host}\\r\\n\\r\\n'`)

    let status = out.match(/^HTTP\/1\.[01] (\d{3})/m)
    if (status) {
        return status[1]
    }
    return failure(out)
}


/*
    Issue "count" requests over a reused connection and return how many were answered 200.

    This one stays on curl, which reuses the connection across a request list in a single invocation.
    It cannot be done with s_client: a reused connection needs each request written only after the
    previous response has been read, and s_client driven from a pipe does not do that -- appweb takes
    one request per readable event, so a batch written in one go leaves everything after the first
    unanswered, and writing them incrementally from a shell loop does not survive the harness either
    (measured: one response, whatever the pause between writes).

    No verification, deliberately. What is under test is that a connection survives being reused, not
    who issued the certificate -- cert.tst.ts asserts verification, and get() is where that lives.
    Dropping --cacert is also what lets this run on Windows, where every curl is built against
    Schannel and honours no file-based CA bundle.
 */
export async function getMany(url: string, count: number, opts: any = {}): Promise<number> {
    let urls = ''

    for (let i = 0; i < count; i++) {
        urls += ' ' + quote(url)
    }
    let out = await Cmd.sh("curl --silent --insecure --output /dev/null --max-time 60 " +
                           "--write-out '%{http_code}\\n'" + urls + " 2>/dev/null")
    return out.trim().split('\n').filter((line: string) => line.trim() == '200').length
}


/*
    Run one s_client against url with the given options, with "feed" as the command that writes the
    request bytes into it. Returns everything s_client wrote, stdout and stderr together, so the
    caller can read either the response or the reason there was not one.
 */
async function sclient(url: string, opts: any, feed: string): Promise<string> {
    let target = new URL(url)
    let host = target.hostname
    let port = target.port || '443'
    let args = ['-quiet', '-connect', `${host}:${port}`]

    /*
        Send SNI for a name and none for an IP literal, which is what curl did and what this group
        depends on: port 5443 carries two virtual hosts selected by server name, one with the
        CA-issued certificate and one self-signed, and cert.tst.ts asserts on which of them answers.

        utils/tls-probe.sh deliberately sends no name at all, because the revocation endpoints it
        probes would be misselected by one. The two are not in conflict -- they probe different
        endpoints.
     */
    if (!/^[0-9.]+$/.test(host) && !host.includes(':')) {
        args.push('-servername', host)
    }
    if (opts.ca) {
        /*
            -verify_return_error is what makes a verification failure end the handshake. Without it
            s_client prints the error and carries on to make the request, so every negative assertion
            in this group would read as a success -- the exact shape of failure issue 10047 is about.

            No -verify_hostname. The assertions here turn on which CA issued the certificate and on
            SNI selection, not on name matching, and the test certificate is CN=localhost with no
            subjectAltName -- so requiring a name match would make the group depend on each OpenSSL
            version's policy for falling back to CN, and buy no assertion.
         */
        args.push('-CAfile', opts.ca, '-verify_return_error', '-verify', '9')
    }
    if (opts.clientCert) {
        args.push('-cert', opts.clientCert)
    }
    if (opts.key) {
        args.push('-key', opts.key)
    }

    return await Cmd.sh(feed + " | openssl s_client " + args.map(quote).join(' ') + " 2>&1")
}


/*
    Name why there was no response, from what s_client wrote.
 */
function failure(out: string): string {
    if (/connection refused|connect:errno|No connection could be made|Connection refused/i.test(out)) {
        return 'FAIL[absent]'
    }
    let alert = out.match(/alert ([a-z ]+)/)
    if (alert) {
        return 'FAIL[' + alert[1].trim() + ']'
    }
    if (/verify error|certificate verify failed|verify return code: [1-9]/i.test(out)) {
        return 'FAIL[verify]'
    }
    return 'FAIL[error]'
}

/*
    True when the endpoint is listening at all. The HTTPS endpoints exist only in a build with SSL,
    so this separates "not configured in this build" from "refused the request" -- a test must not
    report a pass merely because nothing was listening.
 */
export async function listening(url: string): Promise<boolean> {
    return !(await get(url, {insecure: true})).startsWith('FAIL[absent]')
}

/*
    A fuller request than get(): returns the status, the response headers and the body, so a test can
    assert on a redirect target, a Set-Cookie, or response content over TLS. get() stays as it is --
    most of the ssl/ group only needs the status, and a status-only helper cannot be misread as
    having checked a body.

    This one stays on curl. It is only ever used without verification -- basic/secure.tst.ts calls it
    over plain HTTP as well -- so the Schannel limitations that drove get() to s_client do not reach
    it, and curl gives the form handling and header parsing for nothing. It deliberately takes no ca
    or client-certificate options: those cannot be honoured on every platform's curl, and get() is
    where a verified request belongs.

    opts:
      form     an object posted as application/x-www-form-urlencoded
      cookie   a Cookie header value
      creds    "user:password" for Basic auth
      method   an explicit request method
 */
export async function fetch(url: string, opts: any = {}): Promise<any> {
    let args = "--silent --include --insecure --max-time 20"

    if (opts.cookie) {
        args += " --header 'Cookie: " + opts.cookie + "'"
    }
    if (opts.creds) {
        args += " --user '" + opts.creds + "'"
    }
    if (opts.form) {
        for (let key in opts.form) {
            args += " --data-urlencode '" + key + "=" + opts.form[key] + "'"
        }
    } else if (opts.method) {
        args += " --request " + opts.method
    }

    let out = await Cmd.sh("curl " + args + " '" + url + "' 2>/dev/null")

    /*
        Split on the blank line that ends the header block. curl emits CRLF line endings, and a
        redirect body may itself contain a blank line, so only the first split counts.
     */
    let sep = out.indexOf('\r\n\r\n')
    let head = sep >= 0 ? out.slice(0, sep) : out
    let body = sep >= 0 ? out.slice(sep + 4) : ''

    let lines = head.split('\r\n')
    let status = ''
    let headers: any = {}

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]
        if (i == 0) {
            //  "HTTP/1.1 302 Moved Temporarily"
            status = line.split(' ')[1] || ''
            continue
        }
        let colon = line.indexOf(':')
        if (colon > 0) {
            //  Header names fold to lower case so a test need not guess the server's casing
            headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
        }
    }
    return {status: status, headers: headers, body: body}
}
