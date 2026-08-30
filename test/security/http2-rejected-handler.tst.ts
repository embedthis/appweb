/*
    http2-rejected-handler.tst.ts - A rejected HTTP/2 request must not run the handler

    When a header block is refused mid-parse, Appweb sends GOAWAY and writes no response. It also used
    to route the stream and run the real handler anyway, because stream->error was never set on that
    path: sendReset only reaches httpError after a successful setState, and a rejection inside
    addHeaderToSet has usually driven the stream terminal already through sendGoAway's own cleanup.
    httpRouteRequest substitutes the pass handler only when stream->error is set, so the request went
    to fileHandler -- or to CGI, FastCGI or the reverse proxy in a real configuration.

    The client saw nothing, which is why the existing tests could not see this. http2-authority.tst.ts
    and http2-header-list-limit.tst.ts assert wire behaviour, and the wire behaviour was correct all
    along: GOAWAY, no HEADERS, no DATA. What was wrong was internal, so this test observes a side
    effect the handler leaves behind rather than the response. A CGI program that appends to a file is
    the cheapest such witness, and it is also the case that matters -- an attacker spawning processes
    on a server that has already refused the request. Issue 10342.

    Three of the rejection branches also failed to return 0, so they reported success to parseHeader
    and never reached the guard at all: a duplicate :scheme, a connection header, and a te header whose
    value is not "trailers". Those are covered here alongside the two that did.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'

const TESTDIR = resolve(import.meta.dir, '..')
const BIN = resolve(TESTDIR, '../build/bin/appweb')
const PORT = 4516
const HOST = `127.0.0.1:${PORT}`
const WORK = resolve(TESTDIR, 'tmp/http2-rejected-handler')
const CONF = resolve(WORK, 'appweb.conf')
const CGIDIR = resolve(WORK, 'cgi-bin')
const MARKER = resolve(WORK, 'ran.txt')
const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'

interface H2Result {
    data: string
    goaway: number
    reset: number
    headers: boolean
}

function frame(type: number, flags: number, stream: number, payload: Buffer): Buffer {
    let header = Buffer.alloc(9)
    header.writeUIntBE(payload.length, 0, 3)
    header[3] = type
    header[4] = flags
    header.writeUInt32BE(stream & 0x7fffffff, 5)
    return Buffer.concat([header, payload])
}

function hpackString(value: string): Buffer {
    let bytes = Buffer.from(value)
    ttrue(bytes.length < 128)
    return Buffer.concat([Buffer.from([bytes.length]), bytes])
}

function literal(name: string, value: string): Buffer {
    return Buffer.concat([Buffer.from([0]), hpackString(name), hpackString(value)])
}

function literalIndexedName(index: number, value: string): Buffer {
    ttrue(index > 0 && index < 16)
    return Buffer.concat([Buffer.from([index]), hpackString(value)])
}

//  :method GET, :scheme http, then :path and whatever the case under test adds
function requestBlock(extra: Buffer[] = [], authority: string | null = HOST): Buffer {
    let fields = [
        Buffer.from([0x82]),                        // :method GET
        Buffer.from([0x86]),                        // :scheme http
        literalIndexedName(4, '/cgi-bin/mark'),     // :path
    ]
    if (authority != null) {
        fields.push(literalIndexedName(1, authority))
    }
    return Buffer.concat([...fields, ...extra])
}

async function sendH2(block: Buffer): Promise<H2Result> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: H2Result = {data: '', goaway: 0, reset: 0, headers: false}
        let timer = setTimeout(() => {
            socket.destroy()
            resolvePromise(result)
        }, 2000)

        socket.on('connect', () => {
            socket.write(Buffer.concat([
                Buffer.from(PREFACE),
                frame(4, 0, 0, Buffer.alloc(0)),
                frame(1, 0x5, 1, block),
            ]))
        })
        socket.on('data', chunk => {
            pending = Buffer.concat([pending, chunk])
            while (pending.length >= 9) {
                let length = pending.readUIntBE(0, 3)
                if (pending.length < 9 + length) {
                    break
                }
                let type = pending[3]
                let payload = pending.subarray(9, 9 + length)
                pending = pending.subarray(9 + length)
                if (type == 0) {
                    result.data += payload.toString()
                } else if (type == 1) {
                    result.headers = true
                } else if (type == 3 && payload.length >= 4) {
                    result.reset = payload.readUInt32BE(0)
                } else if (type == 7 && payload.length >= 8) {
                    result.goaway = payload.readUInt32BE(4)
                }
            }
            if (result.data.includes('CGI-RAN') || result.goaway || result.reset) {
                clearTimeout(timer)
                socket.destroy()
                resolvePromise(result)
            }
        })
        socket.on('error', reject)
    })
}

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

function handlerRuns(): number {
    if (!existsSync(MARKER)) {
        return 0
    }
    return readFileSync(MARKER, 'utf8').split('\n').filter(line => line.length > 0).length
}

/*
    The CGI program is slower to start than the GOAWAY is to arrive, so a rejected stream can return
    from sendH2 before a wrongly-spawned child has finished writing. Give it room -- a false pass here
    is the failure mode this whole test exists to prevent.
 */
async function rejectedAndNoHandler(name: string, block: Buffer): Promise<void> {
    rmSync(MARKER, {force: true})
    let result = await sendH2(block)
    await Bun.sleep(500)

    //  The client must see the refusal and no response content
    ttrue(result.goaway != 0 || result.reset != 0)
    ttrue(!result.headers)
    ttrue(!result.data.includes('CGI-RAN'))

    //  And the server must not have done the work anyway
    if (handlerRuns() != 0) {
        console.log(name + ': handler ran for a rejected request')
    }
    teq(handlerRuns(), 0)
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(WORK, {recursive: true, force: true})
    mkdirSync(CGIDIR, {recursive: true})

    let script = resolve(CGIDIR, 'mark')
    writeFileSync(script, [
        `#!/bin/sh`,
        `echo ran >> ${MARKER}`,
        `printf 'Content-Type: text/plain\\r\\n\\r\\nCGI-RAN'`,
        ``,
    ].join('\n'))
    chmodSync(script, 0o755)

    writeFileSync(CONF, [
        `ErrorLog ${WORK}/error.log level=0`,
        `Http2 on`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `LimitWorkers 2`,
        `AddHandler cgiHandler exe cgi cgi-nph bat cmd pl py`,
        `ScriptAlias /cgi-bin/ "${CGIDIR}/" cgiHandler`,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', CONF], {stdout: 'ignore', stderr: 'pipe'})
    try {
        if (!await waitForServer()) {
            server.kill('SIGKILL')
            console.log('server did not start')
            ttrue(false)
        }

        /*
            Control first. If a valid request does not run the CGI program then the marker proves
            nothing about the rejected ones, and every assertion below would pass vacuously.
         */
        rmSync(MARKER, {force: true})
        let ok = await sendH2(requestBlock())
        await Bun.sleep(500)
        teq(ok.goaway, 0)
        teq(ok.reset, 0)
        ttrue(ok.data.includes('CGI-RAN'))
        teq(handlerRuns(), 1)

        //  Rejections that already returned 0 and reached the guard
        await rejectedAndNoHandler('duplicate :authority',
            requestBlock([literalIndexedName(1, HOST)]))
        await rejectedAndNoHandler('conflicting :authority and host',
            requestBlock([literal('host', 'evil.example')]))

        //  Rejections that reported success to parseHeader until the missing return 0 was added
        await rejectedAndNoHandler('duplicate :scheme',
            Buffer.concat([requestBlock(), Buffer.from([0x87])]))
        await rejectedAndNoHandler('connection header',
            requestBlock([literal('connection', 'keep-alive')]))
        await rejectedAndNoHandler('te header that is not trailers',
            requestBlock([literal('te', 'gzip')]))

        //  A valid request is still served afterwards -- the fix must not close working streams
        rmSync(MARKER, {force: true})
        let again = await sendH2(requestBlock())
        await Bun.sleep(500)
        teq(again.goaway, 0)
        ttrue(again.data.includes('CGI-RAN'))
        teq(handlerRuns(), 1)

    } finally {
        server.kill('SIGKILL')
        rmSync(WORK, {recursive: true, force: true})
    }
}
