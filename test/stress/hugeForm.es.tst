/*
    hugeForm.tst - Very large (40MB) form
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http
let count = 6000

/* UNUSED as form limit is set to 32K.

if (thas('ME_ESP')) {
    let length
    let s = ''
    for (i in 128) {
        s += ("%05d 0123456789012345678901234567890123456789012345678\n" % [i])
    }
    length += s.length * count

    http.setHeader('Content-Length', length)
    http.setHeader('Content-Type', 'application/x-www-form-urlencoded')
   
    // The big route has a custom request form limit
    http.post(':4100/big/index.esp')

    let written = 0
    for (i in count) {
        http.write(s)
        written += s.length
    }
    ttrue(length == written)
    http.finalize()
    ttrue(http.status == 200)
    http.close()
} else {
    tskip("ESP not enabled")
}
 */
