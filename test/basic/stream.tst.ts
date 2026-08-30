/*
    stream.tst.ts - Incremental reading of a large response

    Reads a response in slices rather than in one call, so the body must survive being
    reassembled across read boundaries that do not line up with packet or chunk boundaries.

    Was previously gated on thas('ME_EJS') against a big.ejs endpoint. Ejscript is not part of
    Appweb, the flag is exported by nothing, and no .ejs document is served -- so the file
    skipped silently (10061). Retargeted at web/100K.txt, which prep.sh generates: 2050 lines
    of 49 digits followed by a terminating "END OF DOCUMENT" line, 102516 bytes in all.
 */

import {teq, ttrue, tget} from '@embedthis/testme'
import {ByteArray, Http} from '@embedthis/ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
const SIZE = 102516
const LINE = "0123456789012345678901234567890123456789012345678"

let http: Http = new Http

//  Read the whole document in small slices and reassemble it
http.get(HTTP + "/100K.txt")
await http.finalize()
teq(http.status, 200)

let parts: string[] = []
let chunk: string
while ((chunk = http.readString(1000)) != null && chunk.length > 0) {
    parts.push(chunk)
}
let body = parts.join('')

//  Every byte arrived, and the slice boundaries did not corrupt the content
teq(body.length, SIZE)
ttrue(parts.length > 1)
ttrue(body.startsWith(LINE + "\n"))
ttrue(body.endsWith("END OF DOCUMENT\n"))

//  Reassembled line structure is intact across the read boundaries
let lines = body.split("\n")
teq(lines.length, 2052)
teq(lines[0], LINE)
teq(lines[2049], LINE)
teq(lines[2050], "END OF DOCUMENT")
http.close()

//  The same document read into a ByteArray in one pass agrees byte for byte
http.get(HTTP + "/100K.txt")
await http.finalize()
teq(http.status, 200)

let buf = new ByteArray
let count = 0
while (http.read(buf) > 0) {
    count += buf.length
}
teq(count, SIZE)
http.close()
