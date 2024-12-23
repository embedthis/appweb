/*
    valgrind.tst - Valgrind tests on Unix-like systems
 */
let PORT = 4150
let valgrind = Cmd.locate("valgrind")

if (Config.OS == 'linux' && tdepth() >= 4 && valgrind) {
    let host = "127.0.0.1:" + PORT

    let httpCmd = Cmd.locate('http').portable + " -q --zero "
    let appweb = Cmd.locate('appweb').portable + " --config appweb.conf --name api.valgrind"
    valgrind += " -q --tool=memcheck --leak-check=yes --suppressions=../../../build/bin/mpr.supp " + appweb

    //  Run http
    function run(args): String {
        try {
            // print(httpCmd, args)
            let cmd = Cmd(httpCmd + args)
            if (cmd.status != 0) {
                print("STATUS " + cmd.status)
                print(cmd.error)
                print(cmd.response)
            }
            ttrue(cmd.status == 0)
            return cmd.response
        } catch (e) {
            ttrue(false, e)
        }
        return null
    }
    /*
        Start valgrind and wait till ready
     */
    // print("VALGRIND CMD: " + valgrind)
    let cmd = Cmd(valgrind, {detach: true})
    let http
    for (i in 10) {
        http = new Http
        try { 
            http.get(host + "/index.html")
            if (http.status == 200) break
        } catch (e) {}
        App.sleep(1000)
        http.close()
    }
    if (http.status != 200) {
        throw "Can't start appweb for valgrind"
    }
    run("-i 100 " + PORT + "/index.html")
    if (thas('ME_ESP')) {
        run(PORT + "/test.esp")
    }
    //  TODO - re-enable php when php shutdown is clean
    if (false && thas('ME_PHP')) {
        run(PORT + "/test.php")
    }
    if (thas('ME_CGI')) {
        run(PORT + "/test.cgi")
    }
    if (thas('ME_EJS')) {
        run(PORT + "/test.ejs")
    }
    run(PORT + "/exit.esp")
    let ok = cmd.wait(10000)
    if (cmd.status != 0) {
        tinfo("valgrind status: " + cmd.status)
        tinfo("valgrind error: " + cmd.error)
        tinfo("valgrind output: " + cmd.response)
    }
    ttrue(cmd.status == 0)
    cmd.stop()

} else {
    if (Config.OS == "linux" && !valgrind) {
        tskip("runs with valgrind installed")
    } else {
        tskip("runs on linux with valgrind at depth 4")
    }
}
