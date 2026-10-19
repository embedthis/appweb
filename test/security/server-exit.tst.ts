/*
    server-exit.tst.ts - a test that ends early must not orphan its withServer() server

    TestMe exits the test process on the first failed assertion, and stops a test that times out with
    SIGTERM. Both skip every finally. A private server killed only from a finally then outlives the test,
    keeps its port, and answers the next test that uses that port with the wrong configuration.
 */

import {ttrue, tskip} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, removeDir, waitForPortFree, workDir} from './server'

const PORT = 4534

async function endChild(mode: string): Promise<boolean> {
    let child = Bun.spawn(['bun', resolve(import.meta.dir, 'server-exit-child.ts'), String(PORT), mode],
                          {stdout: 'pipe', stderr: 'pipe'})
    let output = ''
    if (mode == 'hang') {
        let reader = child.stdout.getReader()
        while (!output.includes('ready')) {
            let {done, value} = await reader.read()
            if (done) {
                break
            }
            output += new TextDecoder().decode(value)
        }
        child.kill('SIGTERM')
    } else {
        output = await new Response(child.stdout).text()
    }
    let status = await child.exited

    //  The child must have reached its callback, so a server was running when it ended
    ttrue(status != 0 && !output.includes('server did not start'))

    let freed = await waitForPortFree(PORT, 20)
    if (!freed) {
        //  Remove the orphan so it does not break later tests. Its PID is in the log the child left behind.
        let log = resolve(workDir('server-exit'), 'error.log')
        let pid = existsSync(log) ? readFileSync(log, 'utf8').match(/PID:\s+(\d+)/)?.[1] : null
        console.log(`${mode}: server on port ${PORT} outlived the test that started it, pid ${pid}`)
        if (pid) {
            process.kill(parseInt(pid), 'SIGKILL')
            await waitForPortFree(PORT, 20)
        }
    }
    await removeDir(workDir('server-exit'))
    return freed
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    let failed = await endChild('fail')
    let terminated = await endChild('hang')
    ttrue(failed)
    ttrue(terminated)
}
