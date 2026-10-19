/*
    api-docs.tst.ts - The shipped API reference documents every public function of the header it describes
 */

import {ttrue} from '@embedthis/testme'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const TOP = resolve(import.meta.dir, '../..')

const PAIRS = [
    ['src/http/http.h', 'doc/api/http.html'],
    ['src/mpr/mpr.h', 'doc/api/mpr.html'],
    ['src/osdep/osdep.h', 'doc/api/osdep.html'],
    ['src/appweb.h', 'doc/api/appweb.html'],
]

function documented(header: string): string[] {
    let names: string[] = []
    let stack: boolean[] = []
    let comment = ''
    let inComment = false
    let lastComment = ''
    for (let line of readFileSync(resolve(TOP, header), 'utf8').split('\n')) {
        let trimmed = line.trim()
        if (inComment) {
            comment += line + '\n'
            if (trimmed.includes('*/')) {
                inComment = false
                lastComment = comment
            }
            continue
        }
        if (trimmed.startsWith('/**')) {
            comment = line + '\n'
            if (trimmed.includes('*/')) {
                lastComment = comment
            } else {
                inComment = true
            }
            continue
        }
        if (/^#\s*if/.test(trimmed)) {
            stack.push(!/^#\s*ifndef\s+_h_/.test(trimmed) && !/__cplusplus/.test(trimmed))
            continue
        }
        if (/^#\s*endif/.test(trimmed)) {
            stack.pop()
            continue
        }
        let match = trimmed.match(/^PUBLIC\b[^;(]*?\b(\w+)\s*\(/)
        if (match && lastComment && !lastComment.includes('@internal') && !stack.includes(true)) {
            names.push(match[1])
        }
        if (trimmed && !trimmed.startsWith('#')) {
            lastComment = ''
        }
    }
    return names
}

//  osdep.h declares macros and types only, so it may have no functions
let total = 0
for (let [header, page] of PAIRS) {
    let names = documented(header)
    total += names.length
    let html = readFileSync(resolve(TOP, page), 'utf8')
    let missing = names.filter(name => !new RegExp('\\b' + name + '\\b').test(html))
    if (missing.length) {
        console.log(`${page} lacks ${missing.length} public function(s) of ${header}: ${missing.join(' ')}`)
    }
    ttrue(missing.length == 0)
}
ttrue(total > 0)
