/*
    http.tst - Test the http command
 */
if (tdepth() >= 6) {

    const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
    const ITER = 10000

    let command = Cmd.locate("http").portable + " --host " + HTTP + " "
    function run(args): String {
        try {
            let cmd = Cmd(command + args)
            ttrue(cmd.status == 0)
            return cmd.response
        } catch (e) {
            ttrue(false, e)
        }
        return null
    }
    twrite("running\n")

    for each (threads in [2, 3, 4, 5, 6, 7, 8, 16]) {
        let start = new Date
        let count = (ITER / threads).toFixed()
        //  TODO - remove --zero
        run("--zero -q -i " + count + " -t " + threads + " " + HTTP + "/bench/bench.html")
        elapsed = start.elapsed
        tinfo("Throughput %.0f request/sec, with %d threads" % [ITER / elapsed * 1000, threads])
    }
    tinfo("%12s %s" % ["[Benchmark]", "finalizing ..."])

} else {
    tskip("runs at depth 6")
}
