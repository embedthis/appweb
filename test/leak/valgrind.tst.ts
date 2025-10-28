/*
    valgrind.tst - Valgrind tests on Unix-like systems

    Tests for memory leaks using Valgrind on Linux. Starts the server under
    Valgrind's memcheck tool, runs various test requests, and validates that
    no memory leaks are detected. Only runs at test depth 4+ on Linux with
    Valgrind installed.

    TODO - Re-enable PHP tests when PHP shutdown is leak-free
 */

import {tdepth, thas, tinfo, tskip, ttrue} from 'testme'
import {App, Cmd, Config, Http} from 'ejscript'

let PORT = 4150
let valgrind = Cmd.locate("valgrind")

if (Config.OS == 'linux' && tdepth() >= 4 && valgrind) {
    let host = "127.0.0.1:" + PORT

    let httpCmd = Cmd.locate('http').portable + " -q --zero "
    let appweb = Cmd.locate('appweb').portable + " --config appweb.conf --name api.valgrind"
    valgrind += " -q --tool=memcheck --leak-check=yes --suppressions=../../../build/bin/mpr.supp " + appweb

    // Helper function to run http command
    function run(args): String | null {
        try {
            let cmd = new Cmd(httpCmd + args)
            ttrue(cmd.status == 0)
            return cmd.response
        } catch (e) {
            ttrue(false, e)
        }
        return null
    }

    // Start valgrind and wait until server is ready
    cmd = new Cmd(valgrind, {detach: true})
    let http
    for (let i in 10) {
        http = new Http
        try {
            http.get(host + "/index.html")
            await http.finalize()
            if (http.status == 200) break
        } catch (e) {}
        App.sleep(1000)
        http.close()
    }
    if (http.status != 200) {
        throw "Can't start appweb for valgrind"
    }

    // Run tests through valgrind-monitored server
    run("-i 100 " + PORT + "/index.html")

    // Test ESP if enabled
    if (thas('ME_ESP')) {
        run(PORT + "/test.esp")
    }

    // PHP disabled due to shutdown leaks
    if (false && thas('ME_PHP')) {
        run(PORT + "/test.php")
    }

    // Test CGI if enabled
    if (thas('ME_CGI')) {
        run(PORT + "/test.cgi")
    }

    // Test EJS if enabled
    if (thas('ME_EJS')) {
        run(PORT + "/test.ejs")
    }

    // Trigger server exit
    run(PORT + "/exit.esp")

    // Wait for valgrind to complete and check for leaks
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
