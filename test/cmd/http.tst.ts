/*
    http.tst - Test the http command

    Comprehensive test suite for the http command-line tool. Tests various HTTP
    operations including GET, POST, PUT, DELETE, authentication, file uploads,
    chunked encoding, protocol versions, and more.
 */

import {tcontains, tdepth, tget, thas, tskip, ttrue} from '@embedthis/testme'
import {App, Cmd, Config, Path, print} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

/*
    The client lives in the build tree at the top of the checkout. Tests run with the working
    directory set to their own directory -- this file's other paths ("../web/tmp", ".") depend on
    that -- so the binary is two levels up, not one. Written as one level it never resolved, and the
    skip below then reported "not built" on every run of a checkout that built it perfectly well.
 */
const HTTP_CLIENT = new Path(import.meta.dir).dirname.dirname
    .join("build/bin/http" + (Config.OS == 'windows' ? ".exe" : ""))

if (!HTTP_CLIENT.exists) {
    tskip("the http client is not built; run 'make build' at the top of the checkout")
    process.exit(0)
}

let cmd: Cmd

/*
    Helper function to run http command and return response
    Don't throw exceptions here so line number reporting works for testme
*/
async function run(cmdline: string): Promise<string | null> {
    try {
        let args = cmdline.split(' ').map(a => a.replace(/'/g, ''))
        cmd = new Cmd([HTTP_CLIENT.toString(), "--host", HTTP, ...args])
        if (cmd.status != 0) {
            return `Bad status: ${cmd.status}`
        }
        return await cmd.response
    } catch (e) {
        return `Exception: ${e.message}`
    }
    return null
}

// Test empty GET response
let data = await run("/empty.html")
ttrue(data == "")

// Test basic GET with content
data = await run("/numbers.txt")
ttrue(data?.startsWith("012345678"))
ttrue(data?.trimEnd().endsWith("END"))

// Test chunked transfer encoding with large file
data = await run("--chunk 10240 /100K.txt")
ttrue(data?.startsWith("012345678"))
ttrue(data?.trimEnd().endsWith("END OF DOCUMENT"))

// Test chunked transfer with empty file
data = await run("--chunk 100 /empty.html")
ttrue(data == "")

// Test keep-alive with multiple requests
await run("-i 300 /index.html")

// Test keep-alive with chunked encoding
await run("--chunk 100 -i 300 /index.html")

// Test HTTP/1.0 protocol
await run("--protocol HTTP/1.0 /index.html")
await run("-i 10 --protocol HTTP/1.0 /index.html")

// Test HTTP/1.1 protocol
await run("--protocol HTTP/1.1 /index.html")
await run("-i 20 --protocol HTTP/1.0 /index.html")
await run("-i 20 --protocol HTTP/1.1 /index.html")

// Test basic authentication with combined user:pass format
await run("--user 'joshua:pass1' /auth/basic/basic.html")

// Test basic authentication with separate user and password options
await run("--user joshua --password pass1 /auth/basic/basic.html")

// Test POST with form data. The /post route echoes parsed parameters (see appweb.conf)
data = await run("--form 'name=John+Smith&address=300+Park+Avenue' /post")
ttrue(data?.contains('name=[John Smith]'))
ttrue(data?.contains('address=[300 Park Avenue]'))

// Test PUT to upload a single file
await run("test.dat /tmp/day.tmp")
ttrue(new Path("../web/tmp/day.tmp").exists)

// Test PUT to upload multiple files to a directory
let files = new Path(".").files().join(" ")
await run(files + " /tmp/")
ttrue(new Path("../web/tmp/http.tst.ts").exists)

// Test DELETE method
await run("test.dat /tmp/test.dat")
if (Config.OS == 'windows') App.sleep(500)
ttrue(new Path("../web/tmp/test.dat").exists)
await run("--method DELETE /tmp/test.dat")
ttrue(!new Path("../web/tmp/test.dat").exists)

// Test OPTIONS and TRACE methods
await run("--method OPTIONS /trace/index.html")
data = await run("--zero --showStatus -q --method TRACE /index.html")
ttrue(data?.trim() == "404")

// Test showing response headers
data = await run("--showHeaders /index.html")
ttrue(data?.contains('Content-Type'))

// Test file upload. /upload/ carries the uploadFilter and stages into web/tmp (see appweb.conf)
let files2 = new Path(".").files().join(" ")
data = await run("--upload " + files2 + " /upload/cgiProgram.cgi")
ttrue(new Path("../web/tmp/http.tst.ts").exists)

/*
    Test upload carrying additional form fields.

    The "+" survives. It is a literal in the part body, not an encoded space: --form does not decode
    its argument before packing it into a multipart part, so the part named "address" carries the
    bytes "300+Park+Avenue". The upload filter replays those fields to CGI as a urlencoded body and
    now percent-encodes them (10148), so "+" arrives as "%2B" and the CGI decodes it back to "+".

    This assertion used to read "300 Park Avenue" and that was the defect, not the expectation.
    Before 10148 the filter wrote the raw bytes into a grammar where "+" means space, so appweb's own
    parameter table held "300+Park+Avenue" while the CGI parsed "300 Park Avenue" -- two parsers, two
    answers, same request. Do not "restore" the decoded spelling: it can only come back by
    reintroducing that split. The non-multipart path below is where "+" legitimately decodes.
 */
let files3 = new Path(".").files().join(" ")
data = await run("--upload --form 'name=John+Smith&address=300+Park+Avenue' " + files3 +
    " /upload/cgiProgram.cgi")
ttrue(data?.contains('PVAR name=John+Smith'))
ttrue(data?.contains('PVAR address=300+Park+Avenue'))

//  The same fields sent as a plain urlencoded body, with no multipart hop, DO decode "+" to a space.
//  The contrast is the point: only the multipart replay preserves the literal.
data = await run("--form 'name=John+Smith&address=300+Park+Avenue' /cgiProgram.cgi")
ttrue(data?.contains('PVAR name=John Smith'))
ttrue(data?.contains('PVAR address=300 Park Avenue'))

//  Test cookie handling. The CGI program echoes HTTP_COOKIE from its environment.
//  run() splits its argument on spaces, so the cookie must be a single token here --
//  attribute-bearing cookies are covered by the session tests, which drive a real client.
data = await run("--cookie test-id=12341234 /cgiProgram.cgi")
ttrue(data?.contains('HTTP_COOKIE=test-id=12341234'))

// Test range requests
ttrue((await run("--range 0-4 /numbers.html"))?.trim() == "01234")
tcontains((await run("--range -5 /numbers.html"))?.trim() || '', "678")

// Run load tests at higher depth levels
if (tdepth() > 2) {
    await run("-i 2000 /index.html")
    await run("-i 2000 /100K.txt")
}

// Cleanup uploaded test files
for (let f of new Path("../web/tmp").files()) {
    await new Path(f.toString()).remove()
}
