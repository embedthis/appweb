/*
    programs.tst - Invoking CGI programs various ways
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

load("cgi.es")

//  Test various forms to invoke cgi programs
let http: Http = new Http
http.get(HTTP + "/cgi-bin/cgiProgram")
ttrue(http.status == 200)
contains(http, "cgiProgram: Output")

http.get(HTTP + "/cgiProgram.cgi")
ttrue(http.status == 200)
contains(http, "cgiProgram: Output")

if (Config.OS == "windows") {
    http.get(HTTP + "/cgi-bin/cgiProgram.exe")
    ttrue(http.status == 200)
    contains(http, "cgiProgram: Output")

    //  Test #!cgiProgram 
    http.get(HTTP + "/cgi-bin/test")
    ttrue(http.status == 200)
    contains(http, "cgiProgram: Output")

    http.get(HTTP + "/cgi-bin/test.bat")
    ttrue(http.status == 200)
    contains(http, "cgiProgram: Output")
}

http.get(HTTP + "/cgi-bin/testScript")
ttrue(http.status == 200)
contains(http, "cgiProgram: Output")
http.close()
