/*
    valgrind.tst - Valgrind memory-leak test on Linux
 */

import {tdepth, teq, tinfo, tskip, ttrue} from '@embedthis/testme'
import {App, Cmd, Config, Http, Path} from '@embedthis/ejscript'

const PORT = 4150
const HOST = "127.0.0.1:" + PORT
const ITERATIONS = 100
const LOG = new Path(import.meta.dir).join('valgrind.out')
const SUPP = new Path(import.meta.dir).join('mpr.supp')

let valgrind = Cmd.locate("valgrind")

if (Config.OS == 'linux' && tdepth() >= 4 && valgrind) {
    let appwebPath = Cmd.locate('appweb')
    if (!appwebPath) {
        throw new Error("Cannot locate the appweb binary. Ensure build/bin is on PATH (test/setup.sh does this).")
    }
    let appweb = appwebPath.portable + " --config appweb.conf --name api.valgrind"

    await Cmd.sh("rm -f '" + LOG + "'")

    /*
        --log-file, not the process streams: this command is detached, and reading a detached
        child's stdout/stderr is racy -- the previous version printed "[object Promise]" for one
        of them. A file is also a durable artifact somebody can read after a failure.

        --suppressions names a file in this directory, under version control. Do not point this
        at build/ -- that is how it went missing for the whole life of this test. See mpr.supp.
     */
    valgrind += " --tool=memcheck --leak-check=full --show-leak-kinds=definite,indirect,possible" +
                " --errors-for-leak-kinds=definite,indirect --error-exitcode=9" +
                " --suppressions='" + SUPP + "' --log-file='" + LOG + "' " + appweb

    /*
        Use the built Http client; return the number of requests not answered with 200.
     */
    async function fetch(path: string, count: number): Promise<number> {
        let bad = 0
        for (let i = 0; i < count; i++) {
            let http = new Http
            try {
                http.get(HOST + path)
                await http.finalize()
                if (http.status != 200) {
                    bad++
                }
            } catch (e) {
                bad++
            } finally {
                http.close()
            }
        }
        return bad
    }

    //  Start valgrind and wait until the server answers. Valgrind slows startup considerably.
    let cmd = new Cmd(valgrind, {detach: true})
    let ready = false
    for (let i = 0; i < 30; i++) {
        let http = new Http
        try {
            http.get(HOST + "/index.html")
            await http.finalize()
            if (http.status == 200) {
                ready = true
            }
        } catch (e) {}
        http.close()
        if (ready) {
            break
        }
        App.sleep(1000)
    }
    if (!ready) {
        tinfo("valgrind log:\n" + await Cmd.sh("cat '" + LOG + "' 2>/dev/null || true"))
        throw new Error("Cannot start appweb under valgrind; see the log above")
    }

    //  Static file path
    let bad = await fetch("/index.html", ITERATIONS)
    teq(bad, 0, "static requests that did not answer 200")

    /*
        Include CGI requests to exercise child-process and pipe cleanup.
     */
    bad = await fetch("/cgiProgram.cgi", 1)
    teq(bad, 0, "CGI requests that did not answer 200")

    /*
        Shut the server down gracefully so the report covers a clean exit. cmd.stop() acts on the
        valgrind wrapper and does not reliably reach the child, which left the report truncated with
        no ERROR SUMMARY -- so signal appweb itself by its --name, and let valgrind observe its exit
        and write the report. cmd.stop() stays as a fallback for the wrapper.
     */
    await Cmd.sh("pkill -TERM -f 'appweb --config appweb.conf --name api.valgrind' || true")

    /*
        Valgrind walks the whole heap at exit before writing the report, which is slow under
        emulation. Wait for the report to be complete rather than for a fixed duration -- and note
        that ERROR SUMMARY is the LAST thing valgrind writes, so its presence means the file is
        whole. Failing here is correct: a truncated report must not read as a clean one.
     */
    for (let i = 0; i < 120; i++) {
        let out = await Cmd.sh("cat '" + LOG + "' 2>/dev/null || true")
        if (out.includes('ERROR SUMMARY')) {
            break
        }
        App.sleep(1000)
    }
    cmd.stop()
    try {
        cmd.wait(10000)
    } catch (e) {}

    let report = await Cmd.sh("cat '" + LOG + "' 2>/dev/null || true")

    /*
        Prove valgrind actually ran before trusting a clean verdict. A missing or empty report is
        the failure mode this whole ticket is about: a check that reports success without checking.
     */
    ttrue(report.length > 0, "valgrind report is non-empty at " + LOG)
    ttrue(report.includes('ERROR SUMMARY'), "valgrind report is complete (has ERROR SUMMARY)")

    /*
        Two report shapes. When something is still allocated at exit valgrind prints a LEAK SUMMARY;
        when nothing is, it prints "All heap blocks were freed -- no leaks are possible" and omits
        the summary entirely. Treating a missing LEAK SUMMARY as "unparseable" would fail the
        cleanest possible result, so handle both.
     */
    const allFreed = report.includes('All heap blocks were freed')

    function bytes(kind: string): number {
        if (allFreed) {
            return 0
        }
        let m = report.match(new RegExp(kind + ":\\s+([\\d,]+) bytes"))
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : -1
    }

    let definite = bytes('definitely lost')
    let indirect = bytes('indirectly lost')
    let possible = bytes('possibly lost')

    /*
        Report what memcheck actually observed, every run, and read the number before trusting a
        clean verdict.

        MPR allocates its heap with mmap and sub-allocates inside it, so memcheck -- which tracks
        the malloc family -- sees only the handful of libc allocations made during bootstrap. This
        run served 101 requests and memcheck counted ~31 allocations totalling ~24KB. Nearly all of
        Appweb's memory traffic is invisible here, exactly as it is to ASan (the "ASan cannot see
        MPR's mmap'd heap" limit recorded in the audit reports).

        So a clean result from this test means "no libc-level leak", NOT "no leak". Closing that gap
        needs either a build that routes mprVirtAlloc through malloc, or VALGRIND_MEMPOOL_* client
        requests in the allocator so memcheck can track MPR's pools. Until then, do not quote this
        test as evidence the server is leak-free.
     */
    let usage = report.match(/total heap usage: ([\d,]+) allocs, ([\d,]+) frees, ([\d,]+) bytes/)
    if (usage) {
        tinfo("memcheck saw " + usage[1] + " allocs, " + usage[2] + " frees, " + usage[3] +
              " bytes -- MPR's mmap'd heap is NOT included; see the comment above")
    }
    tinfo("valgrind: definitely lost " + definite + ", indirectly lost " + indirect +
          ", possibly lost " + possible + " bytes")

    if (definite > 0 || indirect > 0) {
        tinfo("valgrind report:\n" + report)
    }
    teq(definite, 0, "bytes definitely lost")
    teq(indirect, 0, "bytes indirectly lost")

    /*
        "possibly lost" is reported but not failed on. Interior-pointer heuristics misread MPR's
        own self-managed heap, so this number is noisy by construction. It is printed every run so
        a jump is visible; if it grows, read the report before adding a suppression.
     */

    let errors = report.match(/ERROR SUMMARY:\s+(\d+) errors/)
    teq(errors ? parseInt(errors[1], 10) : -1, 0, "memcheck errors")

} else {
    if (Config.OS != "linux") {
        tskip("runs on linux only; valgrind is not available on " + Config.OS)
    } else if (!valgrind) {
        tskip("runs with valgrind installed")
    } else {
        tskip("runs at depth 4; use 'tm --depth 4 leak'")
    }
}
