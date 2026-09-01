/*
    session.ts - Session request helpers

    Form authentication redirects the login POST to the TLS endpoint, and the test certificates are
    self-signed, so these shell out to curl with --insecure rather than using fetch. curl also gives
    a cookie jar, which is what makes a multi-step session flow expressible.
 */

import {Cmd, Path} from '@embedthis/ejscript'

export const COOKIE = '-http-session-'

/*
    Issue a request and return {status, headers, jar}. Redirects are not followed: the status code
    is the assertion, and following it would hide whether access was granted or bounced to login.
 */
export async function req(url: string, opts: any = {}): Promise<any> {
    let args = "--silent --insecure --dump-header - --max-time 20"

    /*
        The body is discarded unless a test asks for it. Keeping the default at /dev/null means the
        header-only tests cannot accidentally match a status line inside a response body.
     */
    args += opts.body ? " --output -" : " --output /dev/null"

    if (opts.jar) {
        args += " --cookie '" + opts.jar + "' --cookie-jar '" + opts.jar + "'"
    }
    if (opts.cookie) {
        args += " --header 'Cookie: " + opts.cookie + "'"
    }
    if (opts.headers) {
        for (let key in opts.headers) {
            args += " --header '" + key + ": " + opts.headers[key] + "'"
        }
    }
    if (opts.post) {
        args += " --data '" + opts.post + "'"
    }
    if (opts.user) {
        args += (opts.digest ? " --digest" : " --basic") + " --user '" + opts.user + "'"
    }

    let out = await Cmd.sh("curl " + args + " '" + url + "' 2>/dev/null")

    /*
        Digest performs a challenge round trip, so curl emits two header blocks. The LAST status is
        the outcome of the authenticated request; taking the first would report the 401 challenge.
     */
    let codes = out.match(/^HTTP\/[\d.]+ (\d+)/gm) || []
    let last = codes.length ? codes[codes.length - 1] : ''
    let status = (last.match(/(\d+)$/) || [])[1] || '000'
    return {status: status, headers: out, body: out}
}

/*
    A fresh cookie-jar path. Each flow needs its own, or one test's session leaks into the next.

    Under test/tmp rather than /tmp. curl here is a native program, and a native program reads /tmp as
    the drive-relative C:\tmp, which does not exist on a stock Windows machine -- so --cookie-jar wrote
    nothing, every request after the login went out without its cookie, and a session that had been
    established correctly looked like one the server had refused to honour.
 */
export function jar(name: string): string {
    let dir = new Path(import.meta.dir).dirname.join('tmp')
    dir.makeDir()
    return dir.join('session-' + name + '-' + process.pid + '.txt').toString()
}

export function sessionCookie(headers: string): string {
    let m = headers.match(new RegExp('Set-Cookie:\\s*(' + COOKIE + '=[^;]+)', 'i'))
    return m ? m[1] : ''
}

/*
    The id is <counter>::http.session::<random>. Only the last field is the unpredictable part; the
    counter is a sequence number and is deliberately not treated as entropy.
 */
export function randomPart(cookie: string): string {
    let parts = cookie.split('::')
    return parts.length >= 3 ? parts[parts.length - 1] : ''
}
