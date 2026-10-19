/*
    upload-abort-fd.tst.ts - An aborted upload releases its temp file descriptor at once
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, writeFileSync} from 'node:fs'
import net from 'node:net'
import {resolve} from 'node:path'
import {BIN, TESTDIR, waitForServer, workDir} from './server'

const PORT = 4535

function openTempFiles(pid: number, dir: string): string[] {
    if (process.platform == 'linux') {
        return readdirSync(`/proc/${pid}/fd`).map(fd => {
            try {
                return readlinkSync(`/proc/${pid}/fd/${fd}`)
            } catch {
                return ''
            }
        }).filter(path => path.startsWith(dir))
    }
    let result = Bun.spawnSync(['lsof', '-p', String(pid), '-Fn'])
    return result.stdout.toString().split('\n').filter(line => line.startsWith('n' + dir)).map(line => line.slice(1))
}

async function abortUpload(): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
        let socket = net.connect(PORT, '127.0.0.1')
        let boundary = '----abort-boundary'
        let head = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="abort.dat"',
            'Content-Type: application/octet-stream',
            '',
            'x'.repeat(2048),
        ].join('\r\n')
        socket.on('connect', () => {
            socket.write([
                'POST /upload/index.html HTTP/1.1',
                `Host: 127.0.0.1:${PORT}`,
                `Content-Type: multipart/form-data; boundary=${boundary}`,
                'Content-Length: 100000',
                '',
                head,
            ].join('\r\n'))
            setTimeout(() => {
                socket.destroy()
                resolvePromise()
            }, 300)
        })
        socket.on('error', () => resolvePromise())
    })
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform != 'linux' && process.platform != 'darwin') {
    tskip('Skip test -- open descriptors are read from /proc or lsof')
} else {
    let work = workDir('upload-abort-fd')
    let uploads = resolve(work, 'uploads')
    rmSync(work, {recursive: true, force: true})
    mkdirSync(uploads, {recursive: true})
    let conf = resolve(work, 'appweb.conf')
    //  A process that disables core dumps is not dumpable on Linux, so its /proc/PID/fd is unreadable to non-root
    writeFileSync(conf, [
        'CoreDumps on',
        `ErrorLog ${work}/error.log level=4`,
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        'AddHandler fileHandler html txt ""',
        '<Route ^/upload/>',
        '    Prefix /upload',
        `    Documents ${TESTDIR}/web`,
        `    UploadDir ${uploads}`,
        '    UploadAutoDelete on',
        '    AddFilter uploadFilter',
        '    Methods set GET POST',
        '</Route>',
        '',
    ].join('\n'))
    let server = Bun.spawn([BIN, '--config', conf], {stdout: 'ignore', stderr: 'ignore'})
    try {
        ttrue(await waitForServer(PORT))
        for (let i = 0; i < 3; i++) {
            await abortUpload()
        }
        // Allow stream cleanup, but finish before garbage collection.
        await Bun.sleep(300)
        let open = openTempFiles(server.pid, uploads)
        if (open.length) {
            console.log('descriptors still open on aborted upload temp files:\n' + open.join('\n'))
        }
        teq(open.length, 0)
    } finally {
        server.kill('SIGKILL')
        await server.exited
        rmSync(work, {recursive: true, force: true})
    }
}
