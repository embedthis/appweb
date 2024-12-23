/*
    http.tst - Test the http command
 */
const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let command = Cmd.locate("http").portable + " --host " + HTTP + " "

var cmd

/*
    function http(args): String {
        let HOST = tget('TM_HTTP') || "127.0.0.1:4100"
        let httpcmd = Cmd.locate("http") + " --host " + HOST + " "
        let result = Cmd.run(httpcmd + args, {exception: false})
        return result.trim()
    }
*/
function run(args): String {
    tverbose('Run', command + args)
    try {
        cmd = Cmd(command + args)
        if (cmd.status != 0) {
            if (cmd.status < 0 && Config.OS == 'windows') {
                ttrue(true)
                return cmd.response
            }
        }
        ttrue(cmd.status == 0) 
        if (cmd.status != 0) {
            // print("CMD", args)
            // print("RESP", cmd.response)
            throw new Error('Bad command status')
        }
        return cmd.response
    } catch (e) {
        tverbose("CATCH", e)
        ttrue(false, e)
    }
    return null
}

//  Empty get
data = run("/empty.html")
ttrue(data == "")

//  Basic get
data = run("/numbers.txt")
ttrue(data.startsWith("012345678"))
ttrue(data.trimEnd().endsWith("END"))

//  Chunked get
data = run("--chunk 10240 /100K.txt")
if (!data.startsWith("012345678")) {
    print("DATA", data)
}
ttrue(data.startsWith("012345678"))
ttrue(data.trimEnd().endsWith("END OF DOCUMENT"))

//  Chunked empty get
data = run("--chunk 100 /empty.html")
ttrue(data == "")

//  Multiple requests to test keep-alive
run("-i 300 /index.html")

//  Multiple requests to test keep-alive
run("--chunk 100 -i 300 /index.html")

//  HTTP/1.0
run("--protocol HTTP/1.0 /index.html")
run("-i 10 --protocol HTTP/1.0 /index.html")

//  Explicit HTTP/1.1
run("--protocol HTTP/1.1 /index.html")
run("-i 20 --protocol HTTP/1.0 /index.html")
run("-i 20 --protocol HTTP/1.1 /index.html")

run("--user 'joshua:pass1' /auth/basic/basic.html")
run("--user 'joshua' --password 'pass1' /auth/basic/basic.html")

if (thas('ME_EJS')) {
    //  Form data
    data = run("--form 'name=John+Smith&address=300+Park+Avenue' /form.ejs")
    ttrue(data.contains('"address": "300 Park Avenue"'))
    ttrue(data.contains('"name": "John Smith"'))
}

//  PUT file
run("test.dat /tmp/day.tmp")
ttrue(Path("../web/tmp/day.tmp").exists)

let files = Path(".").files().join(" ")
run(files + " /tmp/")
ttrue(Path("../web/tmp/http.es.tst").exists)

//  DELETE
run("test.dat /tmp/test.dat")
if (Config.OS == 'windows') App.sleep(500)
ttrue(Path("../web/tmp/test.dat").exists)
run("--method DELETE /tmp/test.dat")
ttrue(!Path("../web/tmp/test.dat").exists)

//  Options with show status
run("--method OPTIONS /trace/index.html")
data = run("--zero --showStatus -q --method TRACE /index.html")
ttrue(data.trim() == "404")

//  Show headers
data = run("--showHeaders /index.html")
ttrue(data.contains('Content-Type'))

//  Upload
if (thas('ME_EJS')) {
    let files = Path(".").files().join(" ")
    data = run("--upload " + files + " /upload.ejs")
    ttrue(data.contains('"clientFilename": "http.es.tst"'))
    ttrue(Path("../web/tmp/http.es.tst").exists)

    let files = Path(".").files().join(" ")
    data = run("--upload --form 'name=John+Smith&address=300+Park+Avenue' " + files + " /upload.ejs")
    ttrue(data.contains('"address": "300 Park Avenue"'))
    ttrue(data.contains('"clientFilename": "http.es.tst"'))

    data = run("--cookie 'test-id=12341234; $domain=site.com; $path=/dir/' /form.ejs")

    ttrue(data.contains('"test-id": '))
    ttrue(data.contains('"domain": "site.com"'))
    ttrue(data.contains('"path": "/dir/"'))
}

//  Ranges
ttrue(run("--range 0-4 /numbers.html").trim() == "01234")
ttrue(run("--range -5 /numbers.html").trim() == "5678")

//  Load test
if (tdepth() > 2) {
    run("-i 2000 /index.html")
    run("-i 2000 /100K.txt")
}
//  Cleanup
for each (f in Path("../web/tmp").files()) {
    Path(f).remove()
}
