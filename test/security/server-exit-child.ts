/*
    server-exit-child.ts - end this process while a withServer() server is running

    Run by server-exit.tst.ts. With "fail", a failing ttrue() exits from inside the callback. With "hang", the
    callback never returns and the parent stops this process with SIGTERM, as the runner does on a timeout.
    Either way the cleanup in withServer's finally never runs.
 */

import {ttrue} from '@embedthis/testme'
import {withServer} from './server'

let [port, mode] = process.argv.slice(2)

await withServer('server-exit', parseInt(port), [], async () => {
    if (mode == 'hang') {
        console.log('ready')
        await new Promise(() => {})
    }
    ttrue(false, 'deliberate failure')
})
