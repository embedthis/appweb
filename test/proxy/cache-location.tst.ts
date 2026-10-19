/*
    cache-location.tst.ts - A proxied Location must not be built from the client's Host, nor replayed
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, spawnServer} from '../security/server'

const PORT = 4517
const BACKEND = 9996
const WORK = resolve(TESTDIR, 'tmp/cache-location')
const ATTACKER = 'attacker.example'
const CANONICAL = 'canonical.example'

/*
    Use 200 because the server cache excludes redirect statuses.
 */
const REPLY = [
    'HTTP/1.1 200 OK',
    'Location: /created-resource',
    'Content-Type: text/plain',
    'Content-Length: 7',
    'Connection: close',
    '',
    'created',
].join('\r\n')

function serveBackend(): any {
    return Bun.listen({
        hostname: '127.0.0.1',
        port: BACKEND,
        socket: {
            data(socket: any) {
                socket.write(REPLY)
            },
        },
    })
}

function writeConf(canonical: string | null): string {
    let conf = resolve(WORK, canonical ? 'canonical.conf' : 'plain.conf')
    writeFileSync(conf, [
        `ErrorLog ${WORK}/error.log level=0`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `LimitWorkers 2`,
        `ExitTimeout 5secs`,
        ``,
        `<Route ^/cached-proxy/(.*)$>`,
        `    Reset pipeline`,
        `    Prefix /cached-proxy`,
        `    Methods set GET`,
        `    Cache server=1hour methods=GET`,
        `    AddHandler proxyHandler ""`,
        canonical ? `    CanonicalName http://${canonical}` : `    # deliberately no CanonicalName`,
        `    ProxyConnect 127.0.0.1:${BACKEND} multiplex=unlimited timeout=20secs min=0 max=1`,
        `</Route>`,
        ``,
    ].join('\n'))
    return conf
}

async function waitForServer(): Promise<boolean> {
    for (let i = 0; i < 40; i++) {
        try {
            let response = await fetch(`http://127.0.0.1:${PORT}/index.html`, {signal: AbortSignal.timeout(500)})
            if (response.status > 0) {
                return true
            }
        } catch {
        }
        await Bun.sleep(250)
    }
    return false
}

//  curl rather than fetch: fetch will not let a Host header be overridden
async function get(path: string, host: string): Promise<string> {
    let proc = Bun.spawn(['curl', '--silent', '--include', '--output', '-', '--max-time', '20',
        '--header', `Host: ${host}`, `http://127.0.0.1:${PORT}${path}`], {stdout: 'pipe', stderr: 'ignore'})
    return await new Response(proc.stdout).text()
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(WORK, {recursive: true, force: true})
    mkdirSync(WORK, {recursive: true})

    //  ---- No CanonicalName: the shipped default, and the vulnerable shape ----
    let server = spawnServer(['--config', writeConf(null)], {stderr: 'ignore'})
    let backend = serveBackend()
    try {
        if (!await waitForServer()) {
            console.log('server did not start')
            ttrue(false)
        }
        //  Unique per run: the cache key is the path, and a stale entry would mask a regression
        let path = '/cached-proxy/loc/' + Date.now()

        //  One unauthenticated request asserting a Host the server has never heard of
        let primed = await get(path, ATTACKER)
        ttrue(/^HTTP\/[\d.]+ 200/m.test(primed))
        ttrue(!new RegExp(ATTACKER, 'i').test(primed))

        /*
            The rewrite must still do its job: the backend said "/created-resource" and the client has
            to be sent to "/cached-proxy/created-resource" or it lands outside the proxy. Relative is
            valid for Location (RFC 9110 10.2.2) and is what the backend sent in the first place.
         */
        ttrue(/^Location:\s*\/cached-proxy\/created-resource\s*$/mi.test(primed))

        /*
            Stop the backend so only cached responses can succeed.
         */
        backend.stop(true)
        await Bun.sleep(250)

        //  The cache is keyed on the request host: another host never sees this entry
        let other = await get(path, `127.0.0.1:${PORT}`)
        ttrue(!/^HTTP\/[\d.]+ 200/m.test(other))
        ttrue(!new RegExp(ATTACKER, 'i').test(other))


        let replayed = await get(path, ATTACKER)
        ttrue(/^HTTP\/[\d.]+ 200/m.test(replayed))
        ttrue(replayed.includes('created'))
        ttrue(!/^Location:/mi.test(replayed))

    } finally {
        try { backend.stop(true) } catch {}
        server.kill('SIGKILL')
        await Bun.sleep(250)
    }

    //  ---- CanonicalName set: unchanged behaviour, and still not the client's Host ----
    server = spawnServer(['--config', writeConf(CANONICAL)], {stderr: 'ignore'})
    backend = serveBackend()
    try {
        if (!await waitForServer()) {
            console.log('server with CanonicalName did not start')
            ttrue(false)
        }
        let path = '/cached-proxy/canon/' + Date.now()
        let primed = await get(path, ATTACKER)

        teq(/^HTTP\/[\d.]+ 200/m.test(primed), true)
        ttrue(!new RegExp(ATTACKER, 'i').test(primed))

        //  Absolute, and built from the configured name rather than anything the client sent
        ttrue(new RegExp(`^Location:\\s*http://${CANONICAL}/cached-proxy/created-resource`, 'mi').test(primed))

    } finally {
        try { backend.stop(true) } catch {}
        server.kill('SIGKILL')
        rmSync(WORK, {recursive: true, force: true})
    }
}
