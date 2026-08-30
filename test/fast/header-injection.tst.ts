/*
    header-injection.tst.ts - A FastCGI app must not be able to split the response header block

    parseFastHeaders shares its shape with the CGI handler, so it shares the same two defects and the same
    fix: a bare CR in a header value is a line terminator to many clients, caches and proxies, and a Status
    value must be a three digit final code. See test/cgi/header-injection.tst.ts for the reasoning.
 */

import {ttrue, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

const fastProgram = (switches: string) =>
    fetch(`${HTTP}/fast-bin/fastProgram?SWITCHES=${encodeURIComponent(switches)}`)

//  A CR inside a header value fails the request
let response = await fastProgram('-c')
ttrue(response.status == 502)
ttrue(response.headers.get('X-Test') == null)

//  A well formed app still works, and its custom headers are still forwarded
response = await fastProgram('-h 1')
ttrue(response.status == 200)
ttrue(response.headers.get('X-FAST-0') == 'A loooooooooooooooooooooooong string')

//  A three digit final code is accepted
for (const code of ['404', '503', '599']) {
    response = await fastProgram(`-s ${code}`)
    ttrue(response.status == Number(code))
}

/*
    Anything else fails the request. fastProgram runs -s through atoi and omits the Status header entirely
    when the result is zero, so it cannot express "Status: 0" or a non-numeric value; those two cases are
    covered against the raw header block in test/cgi/header-injection.tst.ts.
 */
for (const bad of ['999', '-1', '99', '600', '100', '101']) {
    response = await fastProgram(`-s ${bad}`)
    ttrue(response.status == 502)
}
