/*
    cmd.tst - Test Update cmd
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Run a command that creates ../../route-update-cmd.tmp
  
if (Config.OS != "VXWORKS" && Config.OS != "WIN") { 
    let path = Path("../route-update-cmd.tmp")
    path.remove()
    ttrue(!path.exists)

    http.get(HTTP + "/route/update/cmd")
    ttrue(http.status == 200)
    ttrue(http.response == "UPDATED")
    ttrue(path.exists)
    ttrue(path.remove())
    http.close()
}
