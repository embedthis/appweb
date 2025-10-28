/*
    ranges.tst - Ranged get tests

    Tests HTTP range requests (RFC 7233) which allow clients to request specific
    byte ranges of a resource. Tests single ranges, suffix ranges, prefix ranges,
    invalid ranges, and multiple ranges (multipart/byteranges).
 */

import {ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test getting first 5 bytes (range 0-4)
http.setHeader("Range", "bytes=0-4")
http.get(HTTP + "/100K.txt")
await http.finalize()
ttrue(http.status == 206)
ttrue(http.response == "01234")
http.close()

// Test getting last 5 bytes (suffix range)
http.setHeader("Range", "bytes=-5")
http.get(HTTP + "/100K.txt")
await http.finalize()
ttrue(http.status == 206)
ttrue(http.response.trim() == "MENT")
http.close()

// Test getting from specific position till end (prefix range)
http.setHeader("Range", "bytes=102511-")
http.get(HTTP + "/100K.txt")
await http.finalize()
ttrue(http.status == 206)
ttrue(http.response.trim() == "MENT")
http.close()

// Test invalid range (beyond file size) - should return 416 Range Not Satisfiable
http.setHeader("Range", "bytes=117000-")
http.get(HTTP + "/100K.txt")
await http.finalize()
ttrue(http.status == 416)
http.close()

// Test multiple ranges in single request (multipart/byteranges response)
http.setHeader("Range", "bytes=0-5,25-30,-5")
http.get(HTTP + "/100K.txt")
await http.finalize()
ttrue(http.status == 206)
ttrue(http.response.contains("Content-Range: bytes 0-5/102516"))
ttrue(http.response.contains("Content-Range: bytes 25-30/102516"))
ttrue(http.response.contains("Content-Range: bytes 102511-102515/102516"))
ttrue(http.response.contains("012345"))
ttrue(http.response.contains("567890"))
ttrue(http.response.contains("MENT"))
http.close()
