/*
    require-without-authtype.tst.ts - A Require nothing enforces must not start the server
 */

import {ttrue} from '@embedthis/testme'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, removeDir, spawnServer, withServer, workDir} from '../security/server'

const PORT = 4544
const REALM = 'example.com'

/*
    Run appweb on a configuration and return the diagnostic it exited with, or null if the configuration
    was accepted. No ErrorLog is configured, so a config error lands on stderr where an operator would see
    it. An accepted configuration runs until it is killed, and being killed is not a rejection -- without
    the "killed" test this returns a diagnostic for a server that started perfectly well, and the
    assertion passes against the unfixed build.
 */
async function reject(name: string, directives: string[]): Promise<string | null> {
    let work = workDir(name)
    let conf = resolve(work, 'appweb.conf')

    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    writeFileSync(conf, [
        `Listen 127.0.0.1:${PORT}`,
        `Documents ${TESTDIR}/web`,
        ...directives,
        ``,
    ].join('\n'))

    let killed = false
    let server = spawnServer(['--config', conf])
    try {
        let timer = setTimeout(() => {
            killed = true
            server.kill('SIGKILL')
        }, 5000)
        let error = server.stderr ? await new Response(server.stderr).text() : ''
        let status = await server.exited
        clearTimeout(timer)
        return killed || status == 0 ? null : error
    } finally {
        server.kill('SIGKILL')
        await removeDir(work, server.exited)
    }
}

async function status(path: string): Promise<number> {
    let response = await fetch(`http://127.0.0.1:${PORT}${path}`, {signal: AbortSignal.timeout(5000)})
    await response.text()
    return response.status
}

/*
    A Require with no AuthType in scope must stop the server, and the diagnostic must name the route -- an
    operator with a hundred routes cannot act on "some route is wrong".
 */
let error = await reject('require-no-authtype', [
    `<Route ^/private/>`,
    `    Require ability admin`,
    `</Route>`,
])
ttrue(error != null, 'a Require with no AuthType must be rejected')
ttrue(error != null && error.includes('^/private/'), 'the diagnostic must name the offending route')
ttrue(error != null && error.includes('AuthType'), 'the diagnostic must say what is missing')

//  The same at the top level, where there is no enclosing block to inherit from
error = await reject('require-no-authtype-top', [`Require valid-user`])
ttrue(error != null, 'a top-level Require with no AuthType must be rejected')

/*
    Every accepted shape in one server: AuthType before Require, Require before AuthType, AuthType
    inherited from an ancestor route, and Require secure which needs no AuthType at all.
 */
await withServer('require-with-authtype', PORT, [
    `<Route ^/ordered/>`,
    `    AuthType basic ${REALM}`,
    `    Require valid-user`,
    `</Route>`,
    `<Route ^/reversed/>`,
    `    Require valid-user`,
    `    AuthType basic ${REALM}`,
    `</Route>`,
    `<Route ^/outer/>`,
    `    AuthType basic ${REALM}`,
    `    <Route ^/outer/inner/>`,
    `        Require valid-user`,
    `    </Route>`,
    `</Route>`,
    `<Route ^/tls/>`,
    `    Require secure age=30days`,
    `</Route>`,
], async () => {
    /*
        Starting is necessary but not sufficient: the point of the check is that a route carrying a
        Require enforces it, so ask the routes whether they do.
     */
    ttrue(await status('/ordered/index.html') == 401, 'a route with AuthType and Require must demand credentials')
    ttrue(await status('/reversed/index.html') == 401, 'Require written before AuthType must still enforce')
    ttrue(await status('/outer/inner/index.html') == 401, 'a Require must be enforced by an inherited AuthType')
})
