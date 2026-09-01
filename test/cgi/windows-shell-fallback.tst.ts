/*
    windows-shell-fallback.tst.ts - Windows CGI must not promote extensionless batch targets to cmd.exe

    Issue 10155: /cgi-bin/name where only name.bat exists used to run through cmd.exe /Q /C. That
    made ISINDEX query arguments live cmd.exe syntax because CGI escapes them with POSIX backslashes.
 */

import {tget, tskip, ttrue} from '@embedthis/testme'
import {App, Config, Http} from '@embedthis/ejscript'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'

if (Config.OS != 'windows') {
    tskip('Windows cmd.exe shell fallback regression')
} else {
    /*
        Anchor on this file's own directory. The server publishes from test/ -- ScriptAlias maps
        /cgi-bin/ to ${HOME}/cgi-bin/ and Documents is web -- and this file is one level below it, so
        `..` from here is the right base.

        It used to read TESTME_CONFIGDIR, which is the directory holding the testme.json5 that applies
        to the test, and that is not the same thing. test/cgi has its own config, so the base resolved
        to test/cgi and every path below pointed at a test/cgi/cgi-bin and test/cgi/web/tmp that the
        server does not publish and that nothing else creates. mkdirSync would have made them happily
        and the request would then have 404'd on a program that was never staged where the server
        looks. Wrong since the file was written, and invisible because the whole test is gated to
        Windows and has never executed.
     */
    const base = resolve(import.meta.dir, '..')
    const cgiBin = `${base}/cgi-bin`
    const webTmp = `${base}/web/tmp`
    const name = `issue-10155-${App.pid}`
    const batch = `${cgiBin}/${name}.bat`
    const extensionless = `${cgiBin}/${name}`
    const batchSentinel = `${webTmp}/${name}-batch.txt`
    const shellSentinel = `${webTmp}/${name}-shell.txt`

    mkdirSync(cgiBin, {recursive: true})
    mkdirSync(webTmp, {recursive: true})
    rmSync(extensionless, {force: true})
    rmSync(batch, {force: true})
    rmSync(batchSentinel, {force: true})
    rmSync(shellSentinel, {force: true})

    try {
        writeFileSync(batch, [
            '@echo off',
            'echo Content-Type: text/plain',
            'echo.',
            `echo extensionless batch fallback ran>"${batchSentinel}"`,
            'echo extensionless batch fallback ran',
            '',
        ].join('\r\n'))

        /*
            If the old extensionless .bat fallback returns, cmd.exe sees the decoded '&' query token as
            a command separator. The batch-side sentinel catches any fallback execution; the shell-side
            sentinel catches metacharacter injection.
         */
        let http = new Http
        http.get(HTTP + `/cgi-bin/${name}?a%26echo%20shell-ran%3E${encodeURIComponent(shellSentinel)}`)
        await http.finalize()
        ttrue(http.status >= 400, 'extensionless .bat fallback must fail, got ' + http.status)
        http.close()

        ttrue(!existsSync(batchSentinel), 'extensionless .bat target must not run through cmd.exe')
        ttrue(!existsSync(shellSentinel), 'CGI query metacharacter must not execute under cmd.exe')

    } finally {
        rmSync(extensionless, {force: true})
        rmSync(batch, {force: true})
        rmSync(batchSentinel, {force: true})
        rmSync(shellSentinel, {force: true})
    }
}
