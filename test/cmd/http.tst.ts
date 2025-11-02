/*
    http.tst - Test the http command

    Comprehensive test suite for the http command-line tool. Tests various HTTP
    operations including GET, POST, PUT, DELETE, authentication, file uploads,
    chunked encoding, protocol versions, and more.
 */

import {tcontains, tdepth, tget, thas, ttrue} from 'testme'
import {App, Cmd, Config, Path, print} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let cmd: Cmd

/*
    Helper function to run http command and return response
    Don't throw exceptions here so line number reporting works for testme
*/
async function run(cmdline: string): Promise<string | null> {
    try {
        let args = cmdline.split(' ').map(a => a.replace(/'/g, ''))
        cmd = new Cmd(['http', "--host", HTTP, ...args])
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

if (thas('ME_EJS')) {
    // Test POST with form data
    data = await run("--form 'name=John+Smith&address=300+Park+Avenue' /form.ejs")
    ttrue(data?.contains('"address": "300 Park Avenue"'))
    ttrue(data?.contains('"name": "John Smith"'))
}

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

// Test file upload functionality
if (thas('ME_EJS')) {
    let files2 = new Path(".").files().join(" ")
    data = await run("--upload " + files2 + " /upload.ejs")
    ttrue(data?.contains('"clientFilename": "http.tst.ts"'))
    ttrue(new Path("../web/tmp/http.tst.ts").exists)

    // Test upload with additional form data
    let files3 = new Path(".").files().join(" ")
    data = await run("--upload --form 'name=John+Smith&address=300+Park+Avenue' " + files3 + " /upload.ejs")
    ttrue(data?.contains('"address": "300 Park Avenue"'))
    ttrue(data?.contains('"clientFilename": "http.tst.ts"'))

    // Test cookie handling
    data = await run("--cookie 'test-id=12341234; $domain=site.com; $path=/dir/' /form.ejs")
    ttrue(data?.contains('"test-id": '))
    ttrue(data?.contains('"domain": "site.com"'))
    ttrue(data?.contains('"path": "/dir/"'))
}

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
