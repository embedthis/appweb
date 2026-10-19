/*
    Start each shipped configuration with CGI/FastCGI conditionals in both states and verify scripts are never
    served as source.
 */

import {teq, tskip, ttrue} from '@embedthis/testme'
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, removeDir, waitForPortFree, waitForServer, workDir} from './server'

const TOP = resolve(TESTDIR, '..')
const MARKER = 'SHIPPED-CONFIG-SCRIPT-SOURCE'
const SCRIPTS = ['exe', 'cgi', 'cgi-nph', 'out', 'bat', 'cmd', 'pl', 'py', 'php', 'esp']

/*
    The sample FastCGI route may time out without a deployed backend; no response means no content was served.
 */
async function get(port: number, path: string): Promise<{status: number, body: string}> {
    try {
        let response = await fetch(`http://127.0.0.1:${port}${path}`, {signal: AbortSignal.timeout(3000)})
        return {status: response.status, body: await response.text()}
    } catch {
        return {status: 0, body: ''}
    }
}

function prepare(name: string, conf: string, port: number, sslPort: number, invert: boolean): string {
    let work = workDir(name)
    rmSync(work, {recursive: true, force: true})
    cpSync(resolve(TOP, 'src/server'), work, {recursive: true})
    mkdirSync(resolve(work, 'apps'), {recursive: true})
    writeFileSync(resolve(work, 'install.conf'),
        [`Listen 127.0.0.1:${port}`, 'Documents web', 'Set LOG_DIR .', 'Set CACHE_DIR cache', ''].join('\n'))

    let path = resolve(work, conf)
    let text = readFileSync(path, 'utf8')
        .replace(/^Listen 80$/m, `Listen 127.0.0.1:${port}`)
        .replace(/^(\s*)ListenSecure 443$/m, `$1ListenSecure 127.0.0.1:${sslPort}`)
        .replaceAll('/path/to/server.', `${TOP}/certs/self.`)
    if (invert) {
        for (let module of ['CGI_MODULE', 'FAST_MODULE']) {
            text = text.replaceAll(`<if ${module}>`, `<if !${module}>`)
        }
    }
    writeFileSync(path, text)
    for (let ext of SCRIPTS) {
        writeFileSync(resolve(work, `web/probe.${ext}`), MARKER)
    }
    return path
}

async function check(conf: string, invert: boolean, port: number, sslPort: number) {
    let name = `shipped-${conf.replace('.conf', '')}${invert ? '-inverted' : ''}`
    let work = workDir(name)

    ttrue(await waitForPortFree(port))
    let path = prepare(name, conf, port, sslPort, invert)
    let server = Bun.spawn([BIN, '--config', path, '--home', work], {stdout: 'ignore', stderr: 'pipe'})
    try {
        let started = await waitForServer(port)
        if (!started) {
            let log = resolve(work, 'error.log')
            console.log(`${name} did not start:\n` + (existsSync(log) ? readFileSync(log, 'utf8') : ''))
        }
        ttrue(started)
        if (started) {
            teq((await get(port, '/index.html')).status, 200)
            for (let ext of SCRIPTS) {
                let r = await get(port, `/probe.${ext}`)
                if (r.status == 0 || r.status == 200 || r.body.includes(MARKER)) {
                    console.log(`${name}: /probe.${ext} returned ${r.status}: ${r.body}`)
                }
                ttrue(r.status != 200)
                ttrue(!r.body.includes(MARKER))
            }
        }
    } finally {
        server.kill('SIGKILL')
        await removeDir(work, server.exited)
    }
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    await check('appweb.conf', false, 4681, 4691)
    await check('appweb.conf', true, 4682, 4692)
    await check('sample.conf', false, 4683, 4693)
    await check('sample.conf', true, 4684, 4694)
}
