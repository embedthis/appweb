/*
    accept-exhaustion.tst.ts - A server out of descriptors pauses accepting instead of spinning
 */

import {ttrue, tskip} from '@embedthis/testme'
import {execSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import net from 'node:net'
import {BIN, withServer, workDir} from './server'

const PORT = 4579
const NAME = 'accept-exhaustion'

function cpuSeconds(pid: number): number {
    let time = execSync(`ps -o time= -p ${pid}`).toString().trim()
    let parts = time.split(':').map(Number)
    return parts.reduce((total, part) => total * 60 + part, 0)
}

async function hold(count: number): Promise<net.Socket[]> {
    let sockets: net.Socket[] = []
    for (let i = 0; i < count; i++) {
        let socket = net.connect(PORT, '127.0.0.1')
        socket.on('error', () => {})
        sockets.push(socket)
    }
    await Bun.sleep(500)
    return sockets
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else if (process.platform == 'win32') {
    tskip('Skip test -- uses ps and POSIX descriptor limits')
} else {
    await withServer(NAME, PORT, ['LimitFiles 64', 'LimitConnections 1000', 'LimitClients 1000', 'LimitConnectionsPerClient 1000'], async () => {
        let pid = Number(execSync(`pgrep -f "${workDir(NAME)}/appweb.conf"`).toString().trim().split('\n')[0])
        ttrue(pid > 0)

        let sockets = await hold(120)
        let before = cpuSeconds(pid)
        await Bun.sleep(2000)
        let used = cpuSeconds(pid) - before
        if (used >= 0.8) {
            console.log(`server used ${used}s of CPU in 2s while out of descriptors`)
        }
        ttrue(used < 0.8)

        for (let socket of sockets) {
            socket.destroy()
        }
        await Bun.sleep(1500)
        let response = await fetch(`http://127.0.0.1:${PORT}/index.html`, {signal: AbortSignal.timeout(5000)})
        ttrue(response.status == 200)
        await response.text()
    })
}
