/*
    cache-location.tst.ts - A proxied Location must not be built from the client's Host, nor replayed

    Issue 10329, and the same unkeyed-cache mechanism as its sibling cache-cookie.tst.ts (#10093).

    transferProxyHeaders rewrites a backend's relative Location so it carries the route prefix --
    without that, "/x" sends the client back outside the proxy. To absolutise it, it used
    rx->parsedUri when the route had no CanonicalName, and that URI's host is the client's own Host
    header, checked for character class and nothing else. So the client chose the domain it was
    redirected to. makeCacheKey has no Host component and the cache admits any 2xx, so one
    unauthenticated request carrying "Host: attacker.example" stored that answer for everyone who
    asked for the same path afterwards.

    Two independent fixes, both asserted here: the Location is relative when no CanonicalName is set,
    so nothing client-supplied reaches it; and Location is on the cached-header deny-list, so a cache
    hit cannot replay one at all.

    Three traps, all of them hit while measuring this. Any one of them makes a test that passes
    without exercising the defect:

      - The route must use AddHandler, not SetHandler. SetHandler disables the caching handler
        outright, so nothing is cached and the replay never happens.
      - The backend cannot be a CGI script. parseCgiHeaders turns any Location into httpRedirect, so
        a script emitting "Status: 201" plus Location yields a 302 -- and 3xx is excluded from the
        cache. The 2xx-with-Location shape has to come off the wire, which is why this serves a
        canned response from a raw socket.
      - The server must have no CanonicalName in scope. The shared test/appweb.conf sets one
        globally, which takes the safe branch and hides all of this, so this test runs its own.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const TESTDIR = resolve(import.meta.dir, '..')
const BIN = resolve(TESTDIR, '../build/bin/appweb')
const PORT = 4517
const BACKEND = 9996
const WORK = resolve(TESTDIR, 'tmp/cache-location')
const ATTACKER = 'attacker.example'
const CANONICAL = 'canonical.example'

/*
    A genuine 201 with a relative Location. 201 Created is the ordinary REST answer to a resource
    creation and sits squarely inside the 2xx range the cache accepts, which is what makes this
    reachable where a 3xx redirect is not.
 */
const REPLY = [
    'HTTP/1.1 201 Created',
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
    let server = Bun.spawn([BIN, '--config', writeConf(null)], {stdout: 'ignore', stderr: 'ignore'})
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
        ttrue(/^HTTP\/[\d.]+ 201/m.test(primed))
        ttrue(!new RegExp(ATTACKER, 'i').test(primed))

        /*
            The rewrite must still do its job: the backend said "/created-resource" and the client has
            to be sent to "/cached-proxy/created-resource" or it lands outside the proxy. Relative is
            valid for Location (RFC 9110 10.2.2) and is what the backend sent in the first place.
         */
        ttrue(/^Location:\s*\/cached-proxy\/created-resource\s*$/mi.test(primed))

        /*
            Stop the backend before the second request. A cache miss then cannot be answered at all,
            so a successful second response proves it came from the cache rather than from a fresh
            proxy call -- which is the mechanism this finding is about.
         */
        backend.stop(true)
        await Bun.sleep(250)

        let replayed = await get(path, `127.0.0.1:${PORT}`)
        ttrue(/^HTTP\/[\d.]+ 201/m.test(replayed))
        ttrue(replayed.includes('created'))
        ttrue(!new RegExp(ATTACKER, 'i').test(replayed))

        //  The cached copy carries no Location at all, the same treatment Set-Cookie already gets
        ttrue(!/^Location:/mi.test(replayed))

    } finally {
        try { backend.stop(true) } catch {}
        server.kill('SIGKILL')
        await Bun.sleep(250)
    }

    //  ---- CanonicalName set: unchanged behaviour, and still not the client's Host ----
    server = Bun.spawn([BIN, '--config', writeConf(CANONICAL)], {stdout: 'ignore', stderr: 'ignore'})
    backend = serveBackend()
    try {
        if (!await waitForServer()) {
            console.log('server with CanonicalName did not start')
            ttrue(false)
        }
        let path = '/cached-proxy/canon/' + Date.now()
        let primed = await get(path, ATTACKER)

        teq(/^HTTP\/[\d.]+ 201/m.test(primed), true)
        ttrue(!new RegExp(ATTACKER, 'i').test(primed))

        //  Absolute, and built from the configured name rather than anything the client sent
        ttrue(new RegExp(`^Location:\\s*http://${CANONICAL}/cached-proxy/created-resource`, 'mi').test(primed))

    } finally {
        try { backend.stop(true) } catch {}
        server.kill('SIGKILL')
        rmSync(WORK, {recursive: true, force: true})
    }
}
