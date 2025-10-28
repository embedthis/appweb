/*
    Test FAST CGI program invocation methods

    This test verifies that FAST programs can be invoked in various ways:
    - Without file extension (Unix-style)
    - With .exe extension (Windows)
 */

import {ttrue, tget} from 'testme'
import {Config, Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

import {contains, keyword, match} from "./fast"

// Test program invocation without extension
let http: Http = new Http
http.get(HTTP + "/fast-bin/fastProgram")

await http.finalize()
ttrue(http.status == 200)
contains(http, "fastProgram: Output")

// Test program invocation with .exe extension on Windows
if (Config.OS == "windows") {
    http.get(HTTP + "/fast-bin/fastProgram.exe")

    await http.finalize()
    ttrue(http.status == 200)
    contains(http, "fastProgram: Output")
}

