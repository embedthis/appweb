/*
    valgrind.tst - Valgrind memory-leak test on Linux

    Starts the server under valgrind's memcheck tool, drives it with static and CGI requests,
    shuts it down gracefully so the report covers a clean exit, and fails if memcheck reports
    leaked memory or errors. Runs at test depth 4+ on Linux with valgrind installed.

    This test had never executed on any machine before 2026-08-10 (10344). It carried four
    defects, each fatal to its purpose on its own:

      1. It drove the server with `Cmd.locate('http')` -- the `http` client this repository does
         not build and the source archive does not ship (10192). Cmd.locate returned null and the
         test threw a TypeError 28ms in, before valgrind was ever invoked.
      2. It passed --suppressions=../../../build/bin/mpr.supp, a path nothing ever produced.
         Valgrind treats a missing suppressions file as FATAL and refuses to start.
      3. Its only assertion was `cmd.status == 0` on the valgrind process. Without
         --error-exitcode, valgrind exits with the CHILD's status, so a clean appweb shutdown
         returned 0 no matter what memcheck found. Even had it run, it could not have failed on
         a leak.
      4. Its appweb.conf was written for Appweb 4/5 -- `DocumentRoot`, `LoadModulePath
         ../../../out/bin`, <if CGI_MODULE|EJS_MODULE|ESP_MODULE|PHP_MODULE>. Appweb rejected it on
         the first directive and exited 237 before binding a port, so even a fixed harness measured
         a server that never ran: 27 allocations, 0 leaks, a clean bill of health for nothing.

    All four are fixed here. Requests go through the Http class this file already imported for
    its readiness probe, so nothing external is needed; the suppressions file is committed beside
    this test; and the leak verdict now comes from parsing valgrind's own LEAK SUMMARY rather than
    from an exit status that cannot carry it.

    TODO - Re-enable PHP tests when PHP shutdown is leak-free
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
        Issue count requests to path and return how many did not answer 200. Uses the Http class
        rather than an external client so this test depends on nothing the repo does not build --
        that dependency is what stopped it running at all (10344, 10192).
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
        Exercise the CGI path too, so the leak check covers a request that forks a child and
        pipes its output. web/cgiProgram.cgi is staged by prep.sh as a compiled binary.

        Previously this and two sibling blocks were behind thas('ME_CGI'), thas('ME_EJS') and
        `false && thas('ME_PHP')` -- flags the harness exports nowhere, so none of them ran and
        the leak check only ever saw static files (10061). The EJS and PHP blocks are deleted
        rather than revived: neither is part of Appweb and neither document is served.
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
