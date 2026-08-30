/*
    mem-limit.tst.ts - LimitMemory must bind

    LimitMemory sets MPR's maxHeap. Crossing it used to be a log line and nothing else: mprVirtAlloc called
    the notifier and then allocated anyway, and the only policies with any effect at all were abort, restart
    and exit -- each of which takes the whole server down, which is the availability failure a memory ceiling
    exists to prevent. A server could sit at many times its configured limit and keep accepting work.

    The limit now binds by refusing work rather than by failing an allocation: an allocation cannot be
    refused, because callers do not test for a null return, so refusing one would fault the process instead
    of failing the request that caused it. Over the limit, the runtime denies new connections and new
    requests on established connections, prunes its caches, and resumes when memory falls back under.

    A server configured below its own resident size is over the limit from the moment it starts, which is
    what the first case uses: every connection must be refused and the server must stay up. The second case
    is the control -- the same server with a limit it is nowhere near serves normally.
 */

import {teq, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'
import {BIN, TESTDIR, workDir} from './server'

const OVER_PORT = 4523
const UNDER_PORT = 4524

//  Far below anything a started server occupies -- a bare server is a little under 3MB resident -- so the
//  limit is already crossed by the time the listener opens
const TINY = '1MB'

//  Far above it, so nothing about this test's server is unusual
const AMPLE = '1GB'

interface Attempt {
    text: string
    closed: boolean
    connected: boolean
}

/*
    Connect, send a request and report what came back. A refused connection is accepted by the kernel and
    then closed by the server without a byte written, so "connected but closed with no text" is the refusal
    this test is looking for -- distinct from a connection that never established at all.
 */
async function attempt(port: number, timeout = 5000): Promise<Attempt> {
    return await new Promise<Attempt>(resolvePromise => {
        let socket = net.connect(port, '127.0.0.1')
        let result: Attempt = {text: '', closed: false, connected: false}
        let done = false

        let finish = () => {
            if (!done) {
                done = true
                clearTimeout(timer)
                socket.destroy()
                resolvePromise(result)
            }
        }
        let timer = setTimeout(finish, timeout)

        socket.on('connect', () => {
            result.connected = true
            socket.write('GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
        })
        socket.on('data', chunk => (result.text += chunk.toString()))
        socket.on('close', () => {
            result.closed = true
            finish()
        })
        socket.on('error', () => finish())
    })
}

async function listening(port: number, tries = 40): Promise<boolean> {
    for (let i = 0; i < tries; i++) {
        let established = await new Promise<boolean>(resolvePromise => {
            let socket = net.connect(port, '127.0.0.1')
            let done = (up: boolean) => {
                socket.destroy()
                resolvePromise(up)
            }
            socket.setTimeout(500, () => done(false))
            socket.on('connect', () => done(true))
            socket.on('error', () => done(false))
        })
        if (established) {
            return true
        }
        await Bun.sleep(250)
    }
    return false
}

/*
    Start a server whose only unusual directive is its LimitMemory, and run "test" against it. Deliberately
    not withServer: that helper waits for a served request before it hands over, and the whole point of the
    first case is a server that serves nothing.
 */
async function withLimit(name: string, port: number, limit: string, test: (server: Bun.Subprocess) => Promise<void>) {
    let work = workDir(name)
    let conf = resolve(work, 'appweb.conf')

    /*
        A failed assertion ends the test process before the cleanup below runs, so a previous failing run can
        leave a server holding this port. Answering from that server would report on the wrong build.
     */
    if (await listening(port, 1)) {
        console.log(`${name}: port ${port} is already in use -- a server from an earlier run is still holding it`)
        ttrue(false)
        return
    }
    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    writeFileSync(conf, [
        `ErrorLog ${work}/error.log level=4`,
        `Listen 127.0.0.1:${port}`,
        `Documents ${TESTDIR}/web`,
        `AddHandler fileHandler html txt ""`,
        `LimitWorkers 2`,
        `LimitMemory ${limit}`,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', conf], {stdout: 'ignore', stderr: 'ignore'})
    try {
        if (!await listening(port)) {
            console.log(`${name}: server never listened on ${port}`)
            let log = resolve(work, 'error.log')
            if (existsSync(log)) {
                console.log(readFileSync(log, 'utf8'))
            }
            ttrue(false)
            return
        }
        await test(server)
    } finally {
        server.kill('SIGKILL')
        rmSync(work, {recursive: true, force: true})
    }
}

//  Over the limit: work is refused, and the server survives to refuse the next one too
await withLimit('mem-limit-over', OVER_PORT, TINY, async server => {
    let first = await attempt(OVER_PORT)
    ttrue(first.connected, 'the listener must still accept at the TCP level')
    teq(first.text, '', `a request over the memory limit must not be served, got: ${first.text.slice(0, 80)}`)
    ttrue(first.closed, 'the refused connection must be closed, not left hanging')

    let second = await attempt(OVER_PORT)
    teq(second.text, '', 'the server must still be refusing rather than serving')
    ttrue(server.exitCode === null, 'the server must stay up: shedding load is the point, not exiting')
})

//  Under the limit: nothing changes
await withLimit('mem-limit-under', UNDER_PORT, AMPLE, async () => {
    let response = await attempt(UNDER_PORT)
    ttrue(response.text.startsWith('HTTP/1.1 200'), `expected 200, got: ${response.text.slice(0, 80)}`)
})
