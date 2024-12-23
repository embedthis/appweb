/*
    CGI Denial of service testing
 */

const HTTP: Uri = tget('TM_HTTP') || "127.0.0.1:4100"

// Depths:    0  1  2  3   4   5   6   7   8   9 
let sizes = [ 1, 2, 4, 8, 12, 16, 24, 32, 40, 64 ]
count = sizes[tdepth()] * 20

if (!thas('ME_CGI') && tdepth() > 3) {
    //  Check server available
    http = new Http
    http.get(HTTP + "/index.html")
    ttrue(http.status == 200)
    http.close()

    //  Try to crash with DOS attack
    for (i in count) {
        let http = new Http
        http.get(HTTP + '/cgi-bin/cgiProgram')
        http.close()
    }

    //  Check server still there
    App.sleep(1000)
    http = new Http
    http.get(HTTP + "/index.html")
    ttrue(http.status == 200)
    http.close()
}
