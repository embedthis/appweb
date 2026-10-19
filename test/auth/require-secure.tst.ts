/* Require secure must deny HTTP access without falling through to a less protected route. */

import {ttrue} from '@embedthis/testme'
import {withServer} from '../security/server'

const PORT = 6212
const REALM = 'example.com'

async function get(path: string): Promise<{status: number, body: string}> {
    let response = await fetch(`http://127.0.0.1:${PORT}${path}`, {signal: AbortSignal.timeout(5000)})
    return {status: response.status, body: await response.text()}
}

await withServer('require-secure', PORT, [
    `User julie 9d8873a123eb506e7f8e84d1f2a26916 user`,
    //  Require secure written before AuthType
    `<Route ^/auth/basic/>`,
    `    Require secure`,
    `    AuthType basic ${REALM}`,
    `    Require user julie`,
    `</Route>`,
    //  AuthType written first: the secure condition is still moved ahead of it
    `<Route ^/auth/cached/>`,
    `    AuthType basic ${REALM}`,
    `    Require secure`,
    `    Require user julie`,
    `</Route>`,
    //  A TLS-only route with no authentication
    `<Route ^/dir/>`,
    `    Require secure age=30days`,
    `</Route>`,
], async () => {
    let r = await get('/auth/basic/basic.html')
    ttrue(r.status != 200 && !r.body.includes('Access for all'),
        'Require secure + AuthType must not serve content over plain HTTP without credentials')

    r = await get('/auth/cached/index.html')
    ttrue(r.status != 200, 'Require secure after AuthType must not serve content over plain HTTP')

    r = await get('/dir/index.html')
    ttrue(r.status == 403, 'A TLS-only route must refuse a plain HTTP request')

    r = await get('/index.html')
    ttrue(r.status == 200, 'Routes without Require secure still serve over plain HTTP')
})
