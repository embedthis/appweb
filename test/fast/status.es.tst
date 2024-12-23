/*
    status.tst - Test FAST program status responses
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
load("fast.es")

let http = new Http
http.setHeader("SWITCHES", "-s%20711")
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(http.status == 711)
http.close()
