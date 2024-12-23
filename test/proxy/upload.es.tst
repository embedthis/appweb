/*
    upload.tst - File upload tests
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

if (thas('ME_ESP')) {
    http.upload(HTTP + "/upload/upload.esp", { myfile: "test.dat"} )
    ttrue(http.status == 200)
    ttrue(http.response.contains('CLIENT_NAME test.dat'))
    ttrue(http.response.contains('Upload Complete'))
    http.wait()

    http.upload(HTTP + "/upload/upload.esp", { myfile: "test.dat"}, {name: "John Smith", address: "100 Mayfair"} )
    ttrue(http.status == 200)
    ttrue(http.response.contains('CLIENT_NAME test.dat'))
    ttrue(http.response.contains('FORM address=100 Mayfair'))
    ttrue(http.response.contains('Upload Complete'))
    http.close()

} else {
    tskip("esp not enabled")
}
