/*
    csource.ts - Read C source the way the presence guards need to read it

    The guards in this directory assert that a defence is *present* in the shipped amalgamation, which
    is a different question from the one test/guard/amalgamation.tst.ts answers. That one proves the
    vendored files agree with their pak sources, and a fix written into the amalgamation and never
    upstream is dropped by a clean re-import while both sides still agree (10297). Only presence
    catches that.

    Presence means reading C, so each guard needs the same three primitives: strip the comments, find a
    function definition rather than its forward declaration, and brace-match a block. They lived
    separately in each guard until a third needed them (10318).

    Comments are stripped before matching because the prose around a defence names the very tokens
    being asserted, so a guard that matched raw text would pass on a source file whose fix had been
    replaced by a comment describing it.
 */

import {ttrue} from '@embedthis/testme'
import {Cmd, Path} from '@embedthis/ejscript'

/*
    Remove comments, keeping string literals: a defence is often named by one ("cmd.exe",
    "/dev/urandom"), so the literals are the evidence and only the prose may go.
 */
export function stripComments(text: string): string {
    let out = ''
    let i = 0
    let n = text.length
    while (i < n) {
        if (text[i] == '/' && i + 1 < n && text[i + 1] == '*') {
            let end = text.indexOf('*/', i + 2)
            i = end < 0 ? n : end + 2
            out += ' '
        } else if (text[i] == '/' && i + 1 < n && text[i + 1] == '/') {
            let end = text.indexOf('\n', i)
            i = end < 0 ? n : end
            out += ' '
        } else if (text[i] == '"') {
            let j = i + 1
            while (j < n && text[j] != '"') {
                j += text[j] == '\\' ? 2 : 1
            }
            out += text.slice(i, Math.min(j + 1, n))
            i = j + 1
        } else {
            out += text[i]
            i++
        }
    }
    return out
}

//  Return the brace-matched block that follows the offset
export function body(text: string, from: number): string {
    let open = text.indexOf('{', from)
    if (open < 0) {
        return ''
    }
    let depth = 0
    for (let i = open; i < text.length; i++) {
        if (text[i] == '{') {
            depth++
        } else if (text[i] == '}') {
            if (--depth == 0) {
                return text.slice(open, i + 1)
            }
        }
    }
    return ''
}

/*
    Return the body of the function defined at "re", skipping forward declarations. The amalgamation
    declares its statics at the top of each module, so matching the first occurrence of a signature
    lands on a prototype and brace-matches whatever function happens to follow it.
 */
export function definition(text: string, re: RegExp): string {
    let m
    re.lastIndex = 0
    while ((m = re.exec(text)) != null) {
        let depth = 0
        let i = text.indexOf('(', m.index)
        for (; i < text.length; i++) {
            if (text[i] == '(') {
                depth++
            } else if (text[i] == ')' && --depth == 0) {
                break
            }
        }
        let j = i + 1
        while (j < text.length && /\s/.test(text[j])) {
            j++
        }
        if (text[j] == '{') {
            return body(text, j)
        }
    }
    return ''
}

export async function read(path: Path): Promise<string> {
    let text = await Cmd.sh("cat '" + path + "'")
    //  Every assertion downstream is vacuous against an empty read
    ttrue(text.length > 0, 'cannot read ' + path)
    return text
}
