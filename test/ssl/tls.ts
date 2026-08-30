/*
    tls.ts - TLS request helper for the ssl test group

    The Ejscript Http client is built without TLS (Config.SSL is false), so it cannot exercise any of
    this. Tests that gated on it reported PASS while asserting nothing, which is indistinguishable
    from coverage in the summary line -- see issue 10047. These helpers shell out to curl instead,
    the same way ssl/revoke.tst.ts shells out to utils/tls-probe.sh.

    Every helper returns a status string rather than throwing, so a test distinguishes "the server
    refused this handshake" from "the command failed", and a refusal is asserted rather than
    inferred from an exception.
 */

import {Cmd, Path} from '@embedthis/ejscript'

//  Certificate material lives in the certs directory beside test/
const certs = new Path(import.meta.dir).dirname.dirname.join('certs')

export function cert(name: string): string {
    return certs.join(name).toString()
}

/*
    Issue one HTTPS GET and return the HTTP status as a string, or "FAIL[n]" when the transfer did
    not complete -- n is curl's exit code, so a certificate rejection (60) reads differently from a
    connection refusal (7).

    opts:
      ca       verify the server against this CA bundle
      insecure skip server verification entirely
      key      client private key, sent with cert
      clientCert client certificate
 */
export async function get(url: string, opts: any = {}): Promise<string> {
    let args = "--silent --output /dev/null --write-out '%{http_code}' --max-time 20"

    if (opts.insecure) {
        args += ' --insecure'
    }
    if (opts.ca) {
        args += " --cacert '" + opts.ca + "'"
    }
    if (opts.clientCert) {
        args += " --cert '" + opts.clientCert + "'"
    }
    if (opts.key) {
        args += " --key '" + opts.key + "'"
    }

    /*
        The exit status is appended after a bar rather than read from the process, because Cmd.sh
        returns only stdout. curl exits non-zero when the transfer did not complete, which is how a
        rejected certificate (60) is told from a refused connection (7).
     */
    let out = await Cmd.sh("curl " + args + " '" + url + "' 2>/dev/null; echo \"|$?\"")
    let parts = out.trim().split('|')
    let status = parts[0].trim()
    let exit = parts[parts.length - 1].trim()

    if (exit != '0') {
        return 'FAIL[' + exit + ']'
    }
    return status
}

/*
    True when the endpoint is listening at all. The HTTPS endpoints exist only in a build with SSL,
    so this separates "not configured in this build" from "refused the request" -- a test must not
    report a pass merely because nothing was listening.
 */
export async function listening(url: string): Promise<boolean> {
    let status = await get(url, {insecure: true})
    return !status.startsWith('FAIL[7]')
}

/*
    A fuller request than get(): returns the status, the response headers and the body, so a test
    can assert on a redirect target, a Set-Cookie, or response content over TLS. get() stays as it
    is -- most of the ssl/ group only needs the status, and a status-only helper cannot be
    misread as having checked a body.

    opts, in addition to those get() accepts:
      form     an object posted as application/x-www-form-urlencoded
      cookie   a Cookie header value
      creds    "user:password" for Basic auth
 */
export async function fetch(url: string, opts: any = {}): Promise<any> {
    let args = "--silent --include --max-time 20"

    if (opts.insecure !== false) {
        args += ' --insecure'
    }
    if (opts.ca) {
        args += " --cacert '" + opts.ca + "'"
    }
    if (opts.clientCert) {
        args += " --cert '" + opts.clientCert + "'"
    }
    if (opts.key) {
        args += " --key '" + opts.key + "'"
    }
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
