/*
    programs.tst - Invoking FAST programs various ways
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

load("fast.es")

//  Test various forms to invoke programs
let http: Http = new Http
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(http.status == 200)
contains(http, "fastProgram: Output")

if (Config.OS == "windows") {
    http.get(HTTP + "/fast-bin/fastProgram.exe")
    ttrue(http.status == 200)
    contains(http, "fastProgram: Output")
}

