/*
    http2-authority.tst.ts - HTTP/2 authority and Host agreement

    HTTP/2 maps :authority into the same host header used for virtual host routing. A request carrying
    duplicates or a disagreeing Host field must fail before the last value can choose the vhost.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'

const TESTDIR = resolve(import.meta.dir, '..')
const BIN = resolve(TESTDIR, '../build/bin/appweb')
const PORT = 4513
const HOST = `127.0.0.1:${PORT}`
const LOCALHOST = `localhost:${PORT}`
const WORK = resolve(TESTDIR, 'tmp/http2-authority')
const CONF = resolve(WORK, 'appweb.conf')
const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
const PROTOCOL_ERROR = 1

interface H2Result {
    data: string
    goaway: number
    reset: number
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

function requestBlock(path: string, authority: string | null, host: string | null, extra: Buffer[] = []): Buffer {
    let fields = [
        Buffer.from([0x82]),            // :method GET
        Buffer.from([0x86]),            // :scheme http
        literalIndexedName(4, path),    // :path
    ]
    if (authority != null) {
        fields.push(literalIndexedName(1, authority))
    }
    if (host != null) {
        fields.push(literal('host', host))
    }
    return Buffer.concat([...fields, ...extra])
}

async function sendH2(block: Buffer): Promise<H2Result> {
    return await new Promise((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let pending = Buffer.alloc(0)
        let result: H2Result = {data: '', goaway: 0, reset: 0}
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
                } else if (type == 3 && payload.length >= 4) {
                    result.reset = payload.readUInt32BE(0)
                } else if (type == 7 && payload.length >= 8) {
                    result.goaway = payload.readUInt32BE(4)
                }
            }
            if (result.data.includes('Welcome to Local') || result.goaway || result.reset) {
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

async function rejectProtocol(name: string, block: Buffer): Promise<void> {
    let result = await sendH2(block)
    if (result.goaway != PROTOCOL_ERROR && result.reset != PROTOCOL_ERROR) {
        console.log(name + ' expected PROTOCOL_ERROR but got ' + JSON.stringify(result))
    }
    ttrue(result.goaway == PROTOCOL_ERROR || result.reset == PROTOCOL_ERROR)
    ttrue(!result.data.includes('Welcome to Local'))
}

async function acceptRoute(name: string, block: Buffer, marker: string): Promise<void> {
    let result = await sendH2(block)
    if (!result.data.includes(marker)) {
        console.log(name + ' expected ' + marker + ' but got ' + JSON.stringify(result))
    }
    teq(result.goaway, 0)
    teq(result.reset, 0)
    ttrue(result.data.includes(marker))
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    rmSync(WORK, {recursive: true, force: true})
    mkdirSync(WORK, {recursive: true})
    writeFileSync(CONF, [
        `ErrorLog ${WORK}/error.log level=4`,
        `TraceLog ${WORK}/trace.log level=2`,
        `Http2 on`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        `AddHandler fileHandler html txt ""`,
        `LimitWorkers 2`,
        `<VirtualHost *:${PORT}>`,
        `    ServerName localhost:${PORT}`,
        `    Documents ${TESTDIR}/web/vhost/namehost1`,
        `</VirtualHost>`,
        `<VirtualHost *:${PORT}>`,
        `    ServerName 127.0.0.1:${PORT}`,
        `    Documents ${TESTDIR}/web/vhost/namehost2`,
        `    AddHandler fileHandler html txt ""`,
        `</VirtualHost>`,
        ``,
    ].join('\n'))

    let server = Bun.spawn([BIN, '--config', CONF], {stdout: 'ignore', stderr: 'pipe'})
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

        await rejectProtocol('conflicting :authority and Host',
            requestBlock('/vhost1.html', LOCALHOST, HOST))
        await rejectProtocol('duplicate :authority',
            requestBlock('/vhost1.html', LOCALHOST, null, [literalIndexedName(1, HOST)]))
        await rejectProtocol('duplicate Host',
            requestBlock('/vhost1.html', null, LOCALHOST, [literal('host', HOST)]))
        await rejectProtocol('duplicate Authorization',
            requestBlock('/vhost1.html', LOCALHOST, null, [
                literal('authorization', 'Basic am9lOnBhc3N3b3Jk'),
                literal('authorization', 'Basic bWFyeTpwYXNzd29yZA=='),
            ]))

        await acceptRoute('only :authority routes by vhost',
            requestBlock('/vhost1.html', LOCALHOST, null), 'Welcome to Local1')
        await acceptRoute('matching :authority and Host routes by vhost',
            requestBlock('/vhost1.html', LOCALHOST, LOCALHOST), 'Welcome to Local1')
        await acceptRoute('equivalent h2 vhost selection',
            requestBlock('/vhost2.html', HOST, null), 'Welcome to Local2')
    } finally {
        server.kill('SIGKILL')
        rmSync(WORK, {recursive: true, force: true})
    }
}
