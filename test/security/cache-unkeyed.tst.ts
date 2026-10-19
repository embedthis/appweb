/* Unkeyed server caching must warn when query strings can share a response. */

import {tfalse, tskip, ttrue} from '@embedthis/testme'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {BIN, TESTDIR, withServer, workDir} from './server'

const PORT = 4602
const NAME = 'cache-unkeyed'

function warned(log: string, route: string): boolean {
    return log.includes(`Route ^/${route}/ caches cgiHandler responses without request parameters`)
}

if (!existsSync(BIN)) {
    tskip(`Skip test -- appweb is not built at ${BIN}`)
} else {
    //  Only the routes that map CGI can reach it. "static" inherits the file handler alone.
    let route = (name: string, cache: string, cgi = true) => [
        `<Route ^/${name}/>`,
        `    Documents ${TESTDIR}/web`,
        ...(cgi ? ['    AddHandler cgiHandler cgi'] : []),
        `    ${cache}`,
        '</Route>',
    ]
    await withServer(NAME, PORT, [
        ...route('plain', 'Cache server=1hour /report'),
        ...route('unique', 'Cache server=1hour unique /report'),
        ...route('query', 'Cache server=1hour /report?a=1'),
        ...route('client', 'Cache client=1hour'),
        ...route('manual', 'Cache server=1hour manual'),
        ...route('html', 'Cache server=1hour extensions=html'),
        ...route('script', 'Cache server=1hour extensions=cgi'),
        ...route('static', 'Cache server=1hour', false),
    ], async () => {
        let log = readFileSync(resolve(workDir(NAME), 'error.log'), 'utf8')

        ttrue(warned(log, 'plain'))
        ttrue(warned(log, 'script'))

        tfalse(warned(log, 'unique'))
        tfalse(warned(log, 'query'))

        tfalse(warned(log, 'client'))
        tfalse(warned(log, 'manual'))

        tfalse(warned(log, 'html'))
        tfalse(warned(log, 'static'))
    })
}
