/*
    Test chunked encoding with multiple file uploads

    This regression test verifies that the server correctly handles chunked transfer
    encoding when uploading multiple files. Previously failed due to trailing "\r\n"
    in the upload content.
 */

import {tdepth, tget, tskip, ttrue} from '@embedthis/testme'
import {Cmd, Config, Uri} from '@embedthis/ejscript'

let nc
try { nc = Cmd.sh("which nc"); } catch {}

if (tdepth() > 0 && nc && Config.OS != "windows") {
    const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")
    let ip = HTTP.host
    let port = HTTP.port

    //  Chunked upload through netcat. The server must frame it and answer, not hang or reset
    let out = Cmd.sh("cat 01000-chunk.dat | nc " + ip + " " + port)
    ttrue(out.includes("HTTP/1."))

    //  The same payload through the small C client, which controls the trailing bytes exactly
    Cmd.sh("cc -o tcp tcp.c")
    out = Cmd.sh("./tcp " + ip + " " + port + " 01000-chunk.dat")
    ttrue(out.includes("HTTP/1."))

} else {
    tskip("requires nc and depth >= 1")
}
