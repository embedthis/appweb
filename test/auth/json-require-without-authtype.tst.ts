/*
    json-require-without-authtype.tst.ts - The JSON configuration must refuse an unenforceable requirement
 */

import {ttrue} from '@embedthis/testme'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, waitForPortFree, waitForServer, workDir} from '../security/server'

const PORT = 4527
const REALM = 'example.com'

/*
    Return configuration rejection diagnostics or NULL on successful startup. Wait for port release
    between runs; unrelated startup failures and timeouts must not count as configuration rejection.
 */
async function load(name: string, http: object): Promise<string | null> {
    let work = workDir(name)
    let conf = resolve(work, 'appweb.json')
    let killed = false

    ttrue(await waitForPortFree(PORT), `port ${PORT} must be free before starting a server on it`)

    rmSync(work, {recursive: true, force: true})
    mkdirSync(work, {recursive: true})
    writeFileSync(conf, JSON.stringify({
        http: {
            documents: `${TESTDIR}/web`,
            server: {listen: [`http://127.0.0.1:${PORT}`]},
            ...http,
        },
    }, null, 4))

    let server = Bun.spawn([BIN, '--config', conf], {stdout: 'ignore', stderr: 'pipe'})
    try {
        let timer = setTimeout(() => {
            killed = true
            server.kill('SIGKILL')
        }, 5000)
        let error = server.stderr ? await new Response(server.stderr).text() : ''
        let status = await server.exited
        clearTimeout(timer)
        if (!killed && status != 0 && /socket|address|bind|in use/i.test(error)) {
            ttrue(false, `the server could not start for a reason unrelated to the configuration: ${error.trim()}`)
        }
        return killed || status == 0 ? null : error
    } finally {
        server.kill('SIGKILL')
        rmSync(work, {recursive: true, force: true})
    }
}

function route(auth: object): object {
    return {routes: [{pattern: '^/private/', auth}]}
}

//  Every way of stating a requirement must be refused when nothing can enforce it
for (let [what, auth] of [
    ['a named user', {require: {users: 'joshua'}}],
    ['any valid user', {require: {users: '*'}}],
    ['a role list', {require: {roles: ['admin']}}],
    ['a scalar role', {require: {roles: 'admin'}}],
] as [string, object][]) {
    let error = await load('json-require', route(auth))
    ttrue(error != null, `a JSON config requiring ${what} with no auth.type must be rejected`)
    ttrue(error != null && error.includes('^/private/'), `the diagnostic for ${what} must name the route`)
}

//  auth.type on the same route, written after the requirement it enforces
ttrue(await load('json-require', route({require: {users: '*'}, type: 'basic', realm: REALM})) == null,
      'auth.type written after auth.require must still satisfy the check')

//  auth.type inherited from the enclosing configuration rather than set on the route
ttrue(await load('json-require', {
    auth: {type: 'basic', realm: REALM},
    ...route({require: {users: '*'}}),
}) == null, 'an inherited auth.type must satisfy the check')

/*
    Accepted is not the same as enforced. Start the accepted configuration and ask the route whether it
    actually demands credentials.
 */
let work = workDir('json-require-serve')
let conf = resolve(work, 'appweb.json')
rmSync(work, {recursive: true, force: true})
mkdirSync(work, {recursive: true})
writeFileSync(conf, JSON.stringify({
    http: {
        documents: `${TESTDIR}/web`,
        server: {listen: [`http://127.0.0.1:${PORT}`]},
        ...route({type: 'basic', realm: REALM, require: {users: '*'}}),
    },
}, null, 4))

let server = Bun.spawn([BIN, '--config', conf], {stdout: 'ignore', stderr: 'pipe'})
try {
    ttrue(await waitForServer(PORT), 'the accepted JSON configuration must start')
    let response = await fetch(`http://127.0.0.1:${PORT}/private/index.html`, {signal: AbortSignal.timeout(5000)})
    await response.text()
    ttrue(response.status == 401, 'the route must demand credentials, not merely parse')
} finally {
    server.kill('SIGKILL')
    rmSync(work, {recursive: true, force: true})
}
