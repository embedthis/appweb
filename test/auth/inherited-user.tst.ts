/*
    inherited-user.tst.ts - A route-scoped User must not rewrite the credential everywhere

    A nested route may redeclare a User its parent already declared -- rotating one credential for one
    route is the obvious reason to. GRADUATE_HASH gives the nested route its own user table, but
    mprCloneHash is shallow, so the entries in that table were still the parent's HttpUser objects and
    httpAddUser updated whichever object it found, in place. The nested declaration therefore rewrote
    the parent's credential: the password the parent route declared stopped working on the parent route,
    and the nested route's password started working there instead (10310).

    Nothing warns, nothing logs, and no request to the nested route is needed -- the substitution happens
    when the configuration is parsed.

    The route requires "user ralph" rather than an ability, deliberately. The role half of that finding
    does not reach an authorization decision: abilities are computed once, when the User directive is
    parsed, so a later Role edit cannot change a decision made from that snapshot. Asserting on abilities
    here would test nothing about the sharing this covers.
 */

import {ttrue} from '@embedthis/testme'
import {createHash} from 'node:crypto'
import {mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from '../security/server'

const PORT = 4525
const REALM = 'example.com'
const USER = 'ralph'
const PARENT_PASSWORD = 'parent-secret'
const CHILD_PASSWORD = 'child-secret'

const WORK = workDir('inherited-user')
const DOCS = resolve(WORK, 'docs')

//  The config store keeps MD5(user:realm:password), which is what authpass --cipher md5 writes
function hash(password: string): string {
    return createHash('md5').update(`${USER}:${REALM}:${password}`).digest('hex')
}

async function get(path: string, password: string): Promise<number> {
    let credentials = Buffer.from(`${USER}:${password}`).toString('base64')
    let response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
        headers: {Authorization: `Basic ${credentials}`},
        signal: AbortSignal.timeout(5000),
    })
    await response.text()
    return response.status
}

await withServer('inherited-user', PORT, [
    `Documents ${DOCS}`,
    `<Route ^/parent/>`,
    `    AuthType basic ${REALM}`,
    `    User ${USER} ${hash(PARENT_PASSWORD)}`,
    `    Require user ${USER}`,
    `    <Route ^/parent/child/>`,
    `        User ${USER} ${hash(CHILD_PASSWORD)}`,
    `        Require user ${USER}`,
    `    </Route>`,
    `</Route>`,
], async () => {
    mkdirSync(resolve(DOCS, 'parent/child'), {recursive: true})
    writeFileSync(resolve(DOCS, 'parent/index.html'), 'parent\n')
    writeFileSync(resolve(DOCS, 'parent/child/index.html'), 'child\n')

    //  The parent route keeps the credential the parent route declared
    ttrue(await get('/parent/index.html', PARENT_PASSWORD) == 200,
          'the parent route must still accept the password it declared')
    ttrue(await get('/parent/index.html', CHILD_PASSWORD) == 401,
          'the password declared on the nested route must not authenticate on the parent route')

    //  And the nested route gets the credential it declared, which is the point of declaring it
    ttrue(await get('/parent/child/index.html', CHILD_PASSWORD) == 200,
          'the nested route must accept the password it declared')
    ttrue(await get('/parent/child/index.html', PARENT_PASSWORD) == 401,
          'the nested route must not accept the password it replaced')
})
