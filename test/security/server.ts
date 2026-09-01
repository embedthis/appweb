/*
    server.ts - Start a private Appweb on its own port for a ratchet that needs its own configuration

    A limit ratchet has to set the limit it is testing, and test/appweb.conf sets everything big so that the rest
    of the suite can run against one server. These helpers write a small configuration into test/tmp/<name> and
    run an Appweb on it for the duration of one test, so the limit under test is the only thing that is unusual.
 */

import {ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'

export const TESTDIR = resolve(import.meta.dir, '..')
export const BIN = resolve(TESTDIR, '../build/bin/appweb')

/*
    The directory withServer runs "name" in. A test that needs a path in its configuration, an upload directory
    say, builds it from here and can read it back while the test callback is running.
 */
export function workDir(name: string): string {
    return resolve(TESTDIR, `tmp/${name}`)
}

/*
    Remove a work directory that a server has been writing into.

    Killing a process is asynchronous: kill() returns as soon as the signal is delivered, not when the
    process has gone. On Unix that costs nothing, because a directory can be unlinked while a handle is
    still open on a file in it. On Windows it cannot -- the delete fails with EBUSY while the server
    still holds its error and trace logs -- so a test whose assertions had all passed still failed, in
    the cleanup that runs after them. Wait for the exit, then retry briefly: the handles are released as
    the process is torn down, which is not always complete when "exited" resolves.
 */
export async function removeDir(dir: string, exited?: Promise<unknown>): Promise<void> {
    if (exited) {
        await exited
    }
    for (let i = 0; i < 20; i++) {
        try {
            rmSync(dir, {recursive: true, force: true})
            return
        } catch (err) {
            await Bun.sleep(50)
        }
    }
    rmSync(dir, {recursive: true, force: true})
}

/*
    Is something already listening on this port? A server orphaned by an interrupted run keeps its port, the
    server started here then fails to bind, and waitForServer is answered by the orphan -- so the test silently
    runs against a stale build and reports on it. Refuse to start rather than report a result from the wrong
    server.
 */
async function portInUse(port: number): Promise<boolean> {
    return await new Promise(resolvePromise => {
        let socket = net.connect(port, '127.0.0.1')
        let done = (inUse: boolean) => {
            socket.destroy()
            resolvePromise(inUse)
        }
        socket.setTimeout(500, () => done(false))
        socket.on('connect', () => done(true))
        socket.on('error', () => done(false))
    })
}

export async function waitForServer(port: number): Promise<boolean> {
    for (let i = 0; i < 40; i++) {
        try {
            let response = await fetch(`http://127.0.0.1:${port}/index.html`, {signal: AbortSignal.timeout(500)})
            if (response.status > 0) {
                return true
            }
        } catch {
        }
        await Bun.sleep(250)
    }
    return false
}

/*
    Run "test" against a private server on "port" configured with the "extra" directives. The work directory is
    test/tmp/<name> and is removed on the way in and the way out, so a run never sees a previous run's files.
 */
export async function withServer(name: string, port: number, extra: string[], test: () => Promise<void>): Promise<void> {
    let work = workDir(name)
    let conf = resolve(work, 'appweb.conf')

    if (await portInUse(port)) {
        console.log(`${name}: port ${port} is already in use -- a server from an earlier run is still holding it`)
        ttrue(false)
        return
    }
    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    writeFileSync(conf, [
        `ErrorLog ${work}/error.log level=4`,
        `TraceLog ${work}/trace.log level=2`,
        `Http2 on`,
        `Listen 127.0.0.1:${port}`,
        `Documents ${TESTDIR}/web`,
        `AddHandler fileHandler html txt ""`,
        `LimitWorkers 2`,
        ...extra,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', conf], {stdout: 'ignore', stderr: 'pipe'})
    try {
        if (!await waitForServer(port)) {
            server.kill('SIGKILL')
            let error = ''
            if (server.stderr) {
                error = await new Response(server.stderr).text()
            }
            console.log('server did not start: ' + error)
            for (let log of [resolve(work, 'error.log'), resolve(work, 'trace.log')]) {
                if (existsSync(log)) {
                    console.log(log + ':\n' + readFileSync(log, 'utf8'))
                }
            }
            ttrue(false)
        }
        await test()
    } finally {
        server.kill('SIGKILL')
        await removeDir(work, server.exited)
    }
}
