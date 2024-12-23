/*
    01000-chunk.tst - This tests uploading 3 files using chunked encoding as well.
    Was failing due to the trailing "\r\n" in the upload content
 */

let nc
try { nc = Cmd.sh("which nc"); } catch {}

if (tdepth() > 0 && nc && Config.OS != "windows" && thas('ME_EJS')) {
    const HTTP = Uri(tget('TM_HTTP') || "127.0.0.1:4100")
    let ip = HTTP.host
    let port = HTTP.port

    Cmd.sh("cat 01000-chunk.dat | nc " + ip + " " + port);
    Cmd.sh("cc -o tcp tcp.c")
    if (Config.OS == "windows") {
        Cmd.sh("./tcp.exe " + ip + " " + port + " 01000-chunk.dat")
    } else {
        Cmd.sh("./tcp " + ip + " " + port + " 01000-chunk.dat")
    }

} else {
    tskip("requires ejs, nc and depth >= 1")
}
