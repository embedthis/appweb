/*
    escape.tst.ts - Directory listing entry names are escaped for HTML and encoded for the link
 */

import {teq, ttrue} from '@embedthis/testme'
import {mkdirSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {withServer, workDir} from '../security/server'

//  Windows forbids < > : " | ? * in file names, so those names are covered on the other platforms only
const ALL_NAMES = [
    'a"onmouseover=alert(1) b.txt',
    '<img src=x onerror=alert(1)>.txt',
    'a&b.txt',
    "a'b.txt",
    'a b.txt',
    'a?b.txt',
    'a#b.txt',
    '100%.txt',
    'a+b.txt',
    'plain.txt',
]
const NAMES = process.platform == 'win32' ? ALL_NAMES.filter(name => !/[<>:"|?*]/.test(name)) : ALL_NAMES

function unescapeHtml(text: string): string {
    return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#35;/g, '#').replace(/&#40;/g, '(').replace(/&#41;/g, ')').replace(/&amp;/g, '&')
}

async function check(mode: string, port: number, options: string[]): Promise<void> {
    let name = 'listing-escape-' + mode
    let docs = resolve(workDir(name), 'docs')
    await withServer(name, port, [
        `Documents ${docs}`,
        'Options Indexes',
        ...options,
    ], async () => {
        mkdirSync(resolve(docs, 'sub'), {recursive: true})
        for (let file of NAMES) {
            writeFileSync(resolve(docs, file), 'content of ' + file)
        }
        let response = await fetch(`http://127.0.0.1:${port}/`)
        let page = await response.text()
        teq(response.status, 200)

        ttrue(!page.includes('<img src=x'))
        ttrue(!page.includes('"onmouseover'))
        ttrue(!page.includes("a'b"))
        if (NAMES.length == ALL_NAMES.length) {
            ttrue(page.includes('&lt;img src=x onerror=alert(1)&gt;.txt'))
            ttrue(page.includes('a&quot;onmouseover=alert(1) b.txt'))
        }
        ttrue(page.includes('a&amp;b.txt'))
        ttrue(page.includes('a&#39;b.txt'))

        // Ignore fancy-format sort links, which start with ?.
        let hrefs = [...page.matchAll(/href="([^"]*)"/g)].map(m => unescapeHtml(m[1]))
            .filter(h => !h.startsWith('/icons/') && !h.startsWith('?'))
        teq(hrefs.length, NAMES.length + 1)
        ttrue(hrefs.includes('sub/'))
        let seen = 0
        for (let href of hrefs) {
            if (href === 'sub/') {
                continue
            }
            let file = await fetch(`http://127.0.0.1:${port}/${href}`)
            let body = await file.text()
            if (file.status != 200 || !body.startsWith('content of ')) {
                console.log(mode + ': link ' + href + ' gave ' + file.status)
            }
            teq(file.status, 200)
            ttrue(NAMES.includes(body.slice('content of '.length)))
            seen++
        }
        teq(seen, NAMES.length)
    })
}

await check('plain', 4551, [])
await check('fancy', 4552, ['IndexOptions FancyIndexing'])
await check('table', 4553, ['IndexOptions HTMLTable'])
