/*
    params-repeat.tst.ts - A repeated parameter has one defined value
 */

import {teq, tget} from '@embedthis/testme'

const HTTP = tget('TM_HTTP') || 'http://127.0.0.1:4100'

async function param(name: string, query: string, body?: string): Promise<string> {
    let headers: Record<string, string> = {'X-Param': name}
    if (body != null) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    let response = await fetch(`${HTTP}/action/param?${query}`,
        {method: body != null ? 'POST' : 'GET', headers, body})
    let text = await response.text()
    return text.trim().replace(/^VALUE=/, '')
}

teq(await param('a', 'a=1&a=2'), '2')
teq(await param('a', 'a=1+2'), '1 2')
teq(await param('a.b', 'a.b=1&a.b=2'), '2')
teq(await param('a', 'a=1&a='), '')
teq(await param('u', 'u=x', 'u=y'), 'y')
teq(await param('user.email', 'z=1', 'user.email=me%40example.com'), 'me@example.com')
