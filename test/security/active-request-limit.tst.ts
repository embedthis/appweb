/*
    active-request-limit.tst.ts - rejected requests must not leak the active-request monitor counter

    The shared test server intentionally sets LimitRequestsPerClient high, so this test starts an isolated
    server with a limit of 1. One incomplete bodied request holds the counter, a second request is rejected,
    then closing the holder must return the counter to zero so the next request succeeds.
 */

import {ttrue, tskip} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'

const TESTDIR = resolve(import.meta.dir, '..')
const BIN = resolve(TESTDIR, '../build/bin/appweb')
const PORT = 4515
const HOST = `127.0.0.1:${PORT}`
const WORK = resolve(TESTDIR, 'tmp/active-request-limit')
const CONF = resolve(WORK, 'appweb.conf')

async function waitForServer(): Promise<boolean> {
    for (let i = 0; i < 40; i++) {
        try {
            let response = await fetch(`http://${HOST}/index.html`, {signal: AbortSignal.timeout(500)})
            if (response.status > 0) {
                return true
            }
        } catch {
        }
        await Bun.sleep(250)
    }
    return false
}

async function openPartialRequest(): Promise<net.Socket> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        socket.on('connect', () => {
            //  Resolve once the bytes are away, so what the caller waits on next is the server
            //  counting the request rather than this side sending it
            socket.write(`POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 10\r\n\r\n12345`,
                         () => resolvePromise(socket))
        })
        socket.on('error', reject)
    })
}

async function request(): Promise<string> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let response = ''
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(response)
        }, 2000)

        socket.on('connect', () => {
            socket.write(`GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`)
        })
        socket.on('data', chunk => {
            response += chunk.toString()
        })
        socket.on('close', () => {
            clearTimeout(timer)
            resolvePromise(response)
        })
        socket.on('error', reject)
    })
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(WORK, {recursive: true, force: true})
    mkdirSync(WORK, {recursive: true})
    writeFileSync(CONF, [
        `ErrorLog ${WORK}/error.log level=4`,
        `TraceLog ${WORK}/trace.log level=2`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `AddHandler fileHandler html txt ""`,
        `LimitRequestsPerClient 1`,
        `RequestParseTimeout 10secs`,
        `RequestTimeout 10secs`,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', CONF], {stdout: 'ignore', stderr: 'pipe'})
    let holder: net.Socket | null = null
    try {
        if (!await waitForServer()) {
            server.kill('SIGKILL')
            let error = ''
            if (server.stderr) {
                error = await new Response(server.stderr).text()
            }
            console.log('server did not start: ' + error)
            for (let log of [resolve(WORK, 'error.log'), resolve(WORK, 'trace.log')]) {
                if (existsSync(log)) {
                    console.log(log + ':\n' + readFileSync(log, 'utf8'))
                }
            }
            ttrue(false)
        }

        holder = await openPartialRequest()

        /*
            The holder counts as an active request once the server has parsed its headers, which is
            after the write above returns -- so a second request issued immediately can arrive first,
            be served and be gone before the counter ever reaches the limit. That is a race in the
            test, not the behaviour under test, and it is what failed on Linux CI with a 200. Poll
            until the server reflects the holder; a limit that never engages still fails here.
         */
        let refused = ''
        for (let i = 0; i < 20 && !refused.includes('503 Service Unavailable'); i++) {
            refused = await request()
            if (!refused.includes('503 Service Unavailable')) {
                await Bun.sleep(100)
            }
        }
        if (!refused.includes('503 Service Unavailable')) {
            console.log('Expected concurrent request to be refused, got:\n' + refused)
        }
        ttrue(refused.includes('503 Service Unavailable'))

        holder.destroy()
        holder = null
        await Bun.sleep(500)

        let recovered = await request()
        if (!recovered.includes('200 OK')) {
            console.log('Expected request to recover after holder closed, got:\n' + recovered)
        }
        ttrue(recovered.includes('200 OK'))

    } finally {
        holder?.destroy()
        server.kill('SIGKILL')
        await Bun.sleep(100)
        rmSync(WORK, {recursive: true, force: true})
    }
}
