/*
    Test that symbolic links do not escape the document root

    A symbolic link placed inside the document root passes a lexical containment test -- its own name is
    under the document root -- and open() then follows it to a target outside. These tests assert the
    containment decision is made on where a link resolves, not on where it sits.

    Every escape fixture points at a target that exists, so each assertion would serve content without
    the containment check rather than 404 for the trivial reason that nothing is there.

    The links are created here rather than committed, so the shipped test tree stays link-free and the
    source archive can be unpacked on a filesystem without symbolic link support.
 */

import {tget, tskip, ttrue} from '@embedthis/testme'
import {Http, Uri} from '@embedthis/ejscript'
import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const HTTP = new Uri(tget('TM_HTTP') || "127.0.0.1:4100")

if (tget('TESTME_OS') == 'windows') {
    tskip("symbolic links require privilege on windows")
} else {
    /*
        Anchor every path on this file's own directory, not on TESTME_CONFIGDIR.

        The server publishes from test/, and this file is one level below it, so `..` from here is the
        right base whatever the configuration looks like. TESTME_CONFIGDIR is the directory holding
        the testme.json5 that applies to this test, which is not the same thing: it was test/ only for
        as long as this group had no config of its own. Giving test/security/ its own configuration
        group -- so the fuzz campaign's held-open connections stop poisoning the rest of the suite --
        moved it to test/security/, and every fixture below was then created under a test/security/web
        that does not exist. A path that changes meaning when a config file is added is not anchored
        on anything.

        The document root is test/web. test/tmp is a sibling of it, so anything there is outside the
        published tree while still being a file the server could read.
     */
    const base = resolve(import.meta.dir, '..')
    const web = `${base}/web`
    const outside = `${base}/tmp`
    const secret = 'TOP-SECRET-OUTSIDE-DOCROOT\n'

    mkdirSync(outside, {recursive: true})
    mkdirSync(`${web}/tmp`, {recursive: true})
    mkdirSync(`${web}/t-indexlink`, {recursive: true})
    writeFileSync(`${outside}/t-secret.txt`, secret)

    rmSync(`${web}/t-fifo`, {force: true})
    execFileSync('mkfifo', [`${web}/t-fifo`])

    /*
        t-putlink is under web/tmp because the PUT-enabled route publishes that directory
     */
    const links: Record<string, string> = {
        't-escape.txt': `${outside}/t-secret.txt`,
        't-rel-escape.txt': '../tmp/t-secret.txt',
        't-dirlink': outside,
        't-inside.txt': 'index.html',
        't-fifo-inside.txt': 't-fifo',
        'tmp/t-putlink': outside,
    }
    for (let [name, target] of Object.entries(links)) {
        rmSync(`${web}/${name}`, {force: true})
        symlinkSync(target, `${web}/${name}`)
        /*
            existsSync follows the link, so this asserts the fixture resolves to a real target. Without
            it every "must be refused" assertion below would pass for the trivial reason that nothing is
            there, and the test would go on passing after a regression.
         */
        ttrue(existsSync(`${web}/${name}`), `fixture ${name} must resolve to its target`)
    }
    rmSync(`${web}/t-indexlink/index.html`, {force: true})
    symlinkSync(`${outside}/t-secret.txt`, `${web}/t-indexlink/index.html`)
    ttrue(existsSync(`${web}/t-indexlink/index.html`), "directory index link fixture must resolve to its target")

    async function get(uri: string): Promise<Http> {
        let http = new Http
        http.get(HTTP + uri)
        await http.finalize()
        return http
    }

    async function status(uri: string): Promise<number> {
        let http = await get(uri)
        let code = http.status
        http.close()
        return code
    }

    /*
        appweb.conf bans a client that exceeds the NotFoundErrors monitor for the following few seconds,
        and every assertion here that must be refused adds to that count -- as does any test that ran
        before this one. A request that must succeed is therefore retried until the ban lapses. Nothing
        is masked: a wedged or broken server never answers 200, however long it is asked.
     */
    async function served(uri: string): Promise<boolean> {
        for (let i = 0; i < 30; i++) {
            if (await status(uri) == 200) {
                return true
            }
            await new Promise(resolve => setTimeout(resolve, 500))
        }
        return false
    }

    try {
        /*
            The /follow/ route sets FollowSymlinks on. Links are then followed, so a link to a document
            inside the root is served. This runs first: it is the assertion that proves the refusals
            below are refusals of the link and not of everything.
         */
        ttrue(await served('/follow/t-inside.txt'), "link inside the root must be served when following")

        /*
            Links are not followed by default, whether or not the target is outside the root
         */
        ttrue(await status('/t-escape.txt') == 404, "absolute link out of the document root must be refused")
        ttrue(await status('/t-rel-escape.txt') == 404, "relative link out of the document root must be refused")
        ttrue(await status('/t-dirlink/t-secret.txt') == 404, "linked directory must be refused")
        ttrue(await status('/t-inside.txt') == 404, "link inside the document root must be refused by default")
        ttrue(await status('/t-indexlink/index.html') == 404, "linked directory index must be refused explicitly")
        ttrue(await status('/t-indexlink/') == 404, "linked directory index must be refused after index rewrite")

        /*
            The refusal must not leak the target. The 404 carries the error page, not the secret.
         */
        let http = await get('/t-escape.txt')
        ttrue(!http.response.contains("TOP-SECRET"), "refused link must not serve the target content")
        http.close()

        /*
            Following a link must not defeat containment: the resolved target must still be inside the root
         */
        ttrue(await status('/follow/t-escape.txt') == 404, "following must not defeat document root containment")
        ttrue(await status('/follow/t-rel-escape.txt') == 404, "relative escape must be refused when following")
        ttrue(await status('/follow/t-dirlink/t-secret.txt') == 404, "linked directory must be refused when following")

        /*
            A link to a FIFO resolves inside the root, so containment passes. The regular file gate must
            reject it: its open() would block. The file handler runs on the event thread, so the request
            that follows is what proves the server was not wedged.
         */
        ttrue(await status('/follow/t-fifo-inside.txt') == 404, "link to a FIFO must be refused")
        ttrue(await served('/index.html'), "server must still serve after a link to a FIFO")

        /*
            A PUT through a linked directory must not create a file outside the root
         */
        http = new Http
        http.put(HTTP + '/tmp/t-putlink/t-escaped.txt', "data")
        await http.finalize()
        ttrue(http.status >= 400, "PUT through a linked directory must be refused, got " + http.status)
        http.close()
        ttrue(!existsSync(`${outside}/t-escaped.txt`), "PUT through a linked directory must not create a file outside")

    } finally {
        for (let name of Object.keys(links)) {
            rmSync(`${web}/${name}`, {force: true})
        }
        rmSync(`${web}/t-indexlink/index.html`, {force: true})
        rmSync(`${web}/t-indexlink`, {recursive: true, force: true})
        rmSync(`${web}/t-fifo`, {force: true})
        rmSync(`${outside}/t-secret.txt`, {force: true})
        rmSync(`${outside}/t-escaped.txt`, {force: true})
    }
}
