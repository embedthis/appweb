/*
    http.tst - Test the http command

    Benchmark test for the http command-line tool. Tests throughput with various
    thread counts to measure concurrent request handling performance. Only runs
    at test depth 6 or higher to avoid impacting regular test runs.

    TODO - Remove --zero flag once no longer needed
 */

import {tdepth, tget, tinfo, tskip, ttrue, twrite} from 'testme'
import {Cmd} from 'ejscript'

if (tdepth() >= 6) {

    const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
    const ITER = 10000

    let command = Cmd.locate("http").portable + " --host " + HTTP + " "

    // Helper function to run http command and validate results
    function run(args): String | null {
        try {
            let cmd = new Cmd(command + args)
            ttrue(cmd.status == 0)
            return cmd.response
        } catch (e) {
            ttrue(false, e)
        }
        return null
    }

    twrite("running\n")

    // Test throughput with various thread counts
    for (let threads of [2, 3, 4, 5, 6, 7, 8, 16]) {
        let start = new Date
        let count = (ITER / threads).toFixed()
        run("--zero -q -i " + count + " -t " + threads + " " + HTTP + "/bench/bench.html")
        elapsed = start.elapsed
        tinfo("Throughput %.0f request/sec, with %d threads" % [ITER / elapsed * 1000, threads])
    }
    tinfo("%12s %s" % ["[Benchmark]", "finalizing ..."])

} else {
    tskip("runs at depth 6")
}
