/*
    ranges.tst - Ranged get tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Get first 5 bytes
http.setHeader("Range", "bytes=0-4")
http.get(HTTP + "/100K.txt")
ttrue(http.status == 206)
ttrue(http.response == "01234")
http.close()


//  Get last 5 bytes
http.setHeader("Range", "bytes=-5")
http.get(HTTP + "/100K.txt")
ttrue(http.status == 206)
ttrue(http.response.trim() == "MENT")
http.close()


//  Get from specific position till the end
http.setHeader("Range", "bytes=102511-")
http.get(HTTP + "/100K.txt")
ttrue(http.status == 206)
ttrue(http.response.trim() == "MENT")
http.close()

//  Get invalid range
http.setHeader("Range", "bytes=117000-")
http.get(HTTP + "/100K.txt")
ttrue(http.status == 416)
http.close()

//  Multiple ranges
http.setHeader("Range", "bytes=0-5,25-30,-5")
http.get(HTTP + "/100K.txt")
ttrue(http.status == 206)
ttrue(http.response.contains("Content-Range: bytes 0-5/102516"))
ttrue(http.response.contains("Content-Range: bytes 25-30/102516"))
ttrue(http.response.contains("Content-Range: bytes 102511-102515/102516"))
ttrue(http.response.contains("012345"))
ttrue(http.response.contains("567890"))
ttrue(http.response.contains("MENT"))
http.close()
