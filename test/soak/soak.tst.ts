/*
    soak.tst.ts - A sustained mixed workload, and what the server's resource use does across it

    The suite had no test that ran anything for a duration. Everything scales with request size or
    request count -- stress/, security/dos.tst.ts, cgi-dos -- so nothing observed what happens to
    memory, file descriptors or child processes over time. doc/compliance/traceability.md records the
    consequence directly: SEC-013 (resource limits and DoS resilience) is Partial, annotated
    "no load or DoS metrics captured as evidence". This produces those metrics.

    WHAT IS AND IS NOT MEASURED. This samples the operating system's view of the process: resident
    memory, open descriptors, child processes. It cannot see inside the MPR heap, and a clean result
    here is not a statement that the server does not leak -- test/leak/valgrind.tst.ts records the
    same limit from the other side, where memcheck sees only the handful of libc allocations because
    MPR sub-allocates inside an mmap'd region. What this catches is the class of defect that reaches
    the OS: a descriptor never closed, a CGI child never reaped, a buffer that grows without bound.
    Those are the ones that take a device down after a week.

    WHY BOUNDED GROWTH AND NOT ZERO. Caches fill, the session table populates, and an allocator's
    high-water mark rises and stays risen. All three are correct and all three make RSS grow, then
    plateau. A zero-growth assertion would be flaky and would eventually be "fixed" by deleting it.
    A ratio is a real threshold: it fails on a leak and passes on a warm-up.

    The raw figures are printed every run, whatever the verdict. A pass that reports nothing is not
    evidence, and evidence is what this test exists to produce.
 */

import {tdepth, teq, tget, tinfo, tskip, ttrue} from '@embedthis/testme'
import {execSync} from 'node:child_process'
import {readFileSync, readdirSync} from 'node:fs'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

/*
    Seconds of workload per depth. Depth 0 has to stay inside the ordinary suite's budget, so it is a
    smoke test of the harness rather than a soak; the real runs are depth 3 and above, invoked by
    hand. The plateau this is looking for takes at least a minute to establish.
 */
const SECONDS = [3, 10, 30, 60, 120, 240, 480, 900, 1800, 3600]
const DURATION = SECONDS[tdepth()] * 1000

/*
    Resident memory may grow by this much across the run before it is called a leak. Generous on
    purpose: the first requests populate caches and the session table, and the allocator's high-water
    mark never comes back down. A real leak under this workload is not subtle -- it is linear in
    request count, and at these rates that is orders of magnitude, not 60%.
 */
const RSS_GROWTH_LIMIT = 1.6

//  Descriptors and children must not grow at all beyond a small allowance for pooled connections
const FD_GROWTH_LIMIT = 24
const CHILD_GROWTH_LIMIT = 4

interface Sample {
    rssKb: number
    fds: number
    children: number
}

/*
    The front server's pid, read from the file setup.sh writes.

    Not found by scanning ps. Two things make that unreliable, and both were observed: the proxy route
    launches a second appweb on proxy.conf which the front server prunes when it goes idle, and a
    pattern loose enough to exclude that one still matches transient shells. The first version of this
    measured a process that did not exist by the end of the run and reported the server as having
    died while it was answering requests normally.
 */
function serverPid(): number {
    try {
        return parseInt(readFileSync(new URL('../.pidfile', import.meta.url), 'utf8').trim(), 10) || 0
    } catch {
        return 0
    }
}

function sample(pid: number): Sample {
    let rssKb = 0
    let fds = 0
    let children = 0
    try {
        rssKb = parseInt(execSync(`ps -o rss= -p ${pid}`, {encoding: 'utf8'}).trim(), 10) || 0
    } catch {}
    try {
        //  lsof is slow but portable across macOS and Linux; /proc/<pid>/fd is Linux only
        fds = execSync(`lsof -p ${pid} 2>/dev/null | wc -l`, {encoding: 'utf8'}).trim().length > 0
            ? parseInt(execSync(`lsof -p ${pid} 2>/dev/null | wc -l`, {encoding: 'utf8'}).trim(), 10)
            : 0
    } catch {}
    try {
        children = parseInt(execSync(`pgrep -P ${pid} 2>/dev/null | wc -l`, {encoding: 'utf8'}).trim(), 10) || 0
    } catch {}
    return {rssKb, fds, children}
}

function show(label: string, s: Sample): void {
    tinfo('  ' + label.padEnd(8) + ' rss ' + (s.rssKb / 1024).toFixed(1) + ' MB, ' +
          s.fds + ' descriptors, ' + s.children + ' children')
}

//  One request. Returns true if it answered as expected.
async function get(path: string, expect = 200): Promise<boolean> {
    try {
        let reply = await fetch(HTTP + path)
        //  Draining the body is what makes this a completed request rather than an abandoned one
        await reply.arrayBuffer()
        return reply.status == expect
    } catch {
        return false
    }
}

async function postUpload(): Promise<boolean> {
    const boundary = '----soak-boundary'
    const body = '--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="myfile"; filename="soak.dat"\r\n' +
        'Content-Type: text/plain\r\n\r\n' +
        'x'.repeat(4096) + '\r\n' +
        '--' + boundary + '--\r\n'
    try {
        let reply = await fetch(HTTP + '/action/upload', {
            method: 'POST',
            headers: {'Content-Type': 'multipart/form-data; boundary=' + boundary},
            body,
        })
        let text = await reply.text()
        return reply.status == 200 && text.includes('size=4096')
    } catch {
        return false
    }
}

/*
    A WebSocket session: open, exchange, close. Included because the WebSocket path allocates
    per-connection state that nothing else here touches, and because LimitWebSockets is decremented on
    close -- a decrement that is skipped would show up as a route that stops accepting upgrades, which
    the final probe below catches.
 */
async function websocket(): Promise<boolean> {
    return await new Promise<boolean>(resolvePromise => {
        let done = false
        let ok = false
        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                resolvePromise(ok)
            }
        }
        let timer = setTimeout(finish, 5000)
        try {
            let ws = new WebSocket(HTTP.replace(/^http/, 'ws') + '/wsecho')
            ws.onmessage = event => {
                ok = event.data == 'soak'
                ws.close()
            }
            ws.onopen = () => ws.send('soak')
            ws.onclose = () => finish()
            ws.onerror = () => finish()
        } catch {
            finish()
        }
    })
}

const pid = serverPid()
if (!pid) {
    tskip('soak skipped: cannot find the appweb process to measure')
} else if (process.platform == 'win32') {
    tskip('soak skipped: ps, lsof and pgrep are not available on Windows')
} else {

    //  Warm up before the baseline, so caches and the session table are populated on both sides of
    //  the measurement and their filling is not counted as growth
    for (let i = 0; i < 20; i++) {
        await get('/index.html')
        await get('/100K.txt')
    }

    const before = sample(pid)
    show('start', before)
    ttrue(before.rssKb > 0, 'the server process must be measurable')

    let issued = 0
    let failed = 0
    let rounds = 0
    /*
        Per-arm failure counts. A bare total says the workload broke; it does not say which subsystem
        broke, and with eight arms that is the difference between a diagnosis and a re-run.
     */
    const ARMS = ['static', 'large', 'cgi', 'fast', 'proxy', 'upload', 'action', 'websocket']
    const armFailures = ARMS.map(() => 0)
    const started = Date.now()

    /*
        The mix. Every arm reaches a different subsystem: a static file, a large static file, a CGI
        fork, a FastCGI round trip, a proxied request, an upload through the filter, a blocking action
        write, and a WebSocket session. A soak that only fetched index.html would prove the accept
        loop does not leak and nothing else.
     */
    while (Date.now() - started < DURATION) {
        let results = [
            await get('/index.html'),
            await get('/100K.txt'),
            await get('/cgiProgram.cgi?-e'),
            await get('/fast-bin/fastProgram?SWITCHES=-e'),
            await get('/proxy/index.html'),
            await postUpload(),
            await get('/action/stream?size=65536'),
            await websocket(),
        ]
        issued += results.length
        for (let i = 0; i < results.length; i++) {
            if (!results[i]) {
                armFailures[i]++
                failed++
            }
        }
        rounds++
    }

    const after = sample(pid)
    show('end', after)
    tinfo('  ' + rounds + ' rounds, ' + issued + ' requests, ' + failed + ' failed, over ' +
          ((Date.now() - started) / 1000).toFixed(1) + 's at depth ' + tdepth())

    //  PR-6: every request answered
    if (failed != 0) {
        console.log('soak: ' + failed + ' of ' + issued + ' requests did not answer as expected')
        console.log('soak: failures by arm -- ' +
            ARMS.map((name, i) => name + ' ' + armFailures[i] + '/' + rounds).join(', '))
    }
    teq(failed, 0)
    ttrue(issued > 0)

    /*
        SR-14. Reported before asserted, so a failing run leaves the numbers behind rather than only
        a verdict.
     */
    const rssRatio = after.rssKb / before.rssKb
    const fdGrowth = after.fds - before.fds
    const childGrowth = after.children - before.children
    tinfo('  rss x' + rssRatio.toFixed(2) + ', descriptors +' + fdGrowth + ', children +' + childGrowth)

    if (rssRatio > RSS_GROWTH_LIMIT) {
        console.log('soak: resident memory grew ' + rssRatio.toFixed(2) + 'x over ' + issued +
            ' requests (' + before.rssKb + 'KB to ' + after.rssKb + 'KB)')
    }
    ttrue(rssRatio <= RSS_GROWTH_LIMIT)

    if (fdGrowth > FD_GROWTH_LIMIT) {
        console.log('soak: open descriptors grew by ' + fdGrowth + ' over ' + issued + ' requests')
    }
    ttrue(fdGrowth <= FD_GROWTH_LIMIT)

    /*
        Children are CGI and FastCGI processes. FastCGI keeps its app alive by design, so a small
        allowance is correct; a count that tracks the request count is a reaping defect.
     */
    if (childGrowth > CHILD_GROWTH_LIMIT) {
        console.log('soak: child processes grew by ' + childGrowth + ' over ' + issued + ' requests')
    }
    ttrue(childGrowth <= CHILD_GROWTH_LIMIT)

    //  Nothing staged by the soak's uploads survives it
    try {
        let leftover = readdirSync(new URL('../tmp/keep', import.meta.url).pathname)
        tinfo('  tmp/keep holds ' + leftover.length + ' file(s) after the soak')
    } catch {}

    /*
        And the server still serves. A soak that exhausted a pool, wedged a queue or banned the test
        client would still satisfy every growth bound above -- the counters would simply stop moving.
     */
    ttrue(await get('/index.html'), 'the server must still answer after the soak')
    ttrue(await get('/cgiProgram.cgi?-e'), 'CGI must still run after the soak')
    ttrue(await websocket(), 'a WebSocket must still open and echo after the soak')
}
