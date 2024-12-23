/*
    extra.tst - Extra path handling for CGI
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

load("cgi.es")

http.get(HTTP + "/cgiProgram.cgi")
ttrue(http.status == 200)
match(http, "PATH_INFO", "")
match(http, "PATH_TRANSLATED", "")

http.get(HTTP + "/cgiProgram.cgi/extra/path")
match(http, "PATH_INFO", "/extra/path")
let scriptFilename = keyword(http, "SCRIPT_FILENAME")
let path = Path(scriptFilename).dirname.join("extra/path")
let translated = Path(keyword(http, "PATH_TRANSLATED"))
ttrue(path == translated)

http.close()
