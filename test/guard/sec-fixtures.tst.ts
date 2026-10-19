/*
    Fuzz fixtures must match their product definitions byte for byte. Skip when test/sec is absent from the release
    archive.
 */

import {tskip, ttrue} from '@embedthis/testme'
import {Path} from '@embedthis/ejscript'
import {body, read} from './csource'

const TOP = new Path(import.meta.dir).dirname.dirname
const FIXTURES = TOP.join('test/sec/fixtures/appweb-fixtures.h')
const SOURCE = TOP.join('src/mpr/mprLib.c')

const SIGNATURES = [
    'static char *uriDecode(cchar *inbuf, bool plusIsSpace)',
    'PUBLIC char *mprUriDecode(cchar *inbuf)',
    'PUBLIC char *mprUriDecodeInSitu(char *inbuf)',
    'PUBLIC int64 stoiradix(cchar *str, int radix, int *err)',
]


function definition(text: string, signature: string): string {
    let at = text.indexOf(signature + '\n{')
    return at < 0 ? '' : signature + '\n' + body(text, at)
}

if (!FIXTURES.exists) {
    tskip('test/sec is not part of this tree')
} else {
    //  A Windows checkout may carry CRLF line endings; compare the text, not the line terminators
    let fixtures = (await read(FIXTURES)).replace(/\r\n/g, '\n')
    let source = (await read(SOURCE)).replace(/\r\n/g, '\n')
    for (let signature of SIGNATURES) {
        let copy = definition(fixtures, signature)
        let original = definition(source, signature)
        ttrue(original != '', `src/mpr/mprLib.c no longer defines ${signature}`)
        ttrue(copy == original, `appweb-fixtures.h differs from src/mpr/mprLib.c for ${signature} -- copy it again`)
    }
}
