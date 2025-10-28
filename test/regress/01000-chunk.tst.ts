/*
    Test chunked encoding with multiple file uploads

    This regression test verifies that the server correctly handles chunked transfer
    encoding when uploading multiple files. Previously failed due to trailing "\r\n"
    in the upload content.
 */

import {tdepth, tget, thas, tskip} from 'testme'
import {Cmd, Config, Uri} from 'ejscript'

let nc
try { nc = Cmd.sh("which nc"); } catch {}

if (tdepth() > 0 && nc && Config.OS != "windows" && thas('ME_EJS')) {
    const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")
    let ip = HTTP.host
    let port = HTTP.port

    // Test chunked upload using netcat
    Cmd.sh("cat 01000-chunk.dat | nc " + ip + " " + port);

    // Test chunked upload using custom TCP client
    Cmd.sh("cc -o tcp tcp.c")
    if (Config.OS == "windows") {
        Cmd.sh("./tcp.exe " + ip + " " + port + " 01000-chunk.dat")
    } else {
        Cmd.sh("./tcp " + ip + " " + port + " 01000-chunk.dat")
    }

} else {
    tskip("requires ejs, nc and depth >= 1")
}
