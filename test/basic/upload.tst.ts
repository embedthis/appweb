/*
    upload.tst - File upload tests

    Tests HTTP multipart form file uploads with and without additional form fields.
    Currently disabled pending ESP configuration.
 */

import {thas, tskip, ttrue, tget} from 'testme'
import {Http} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

if (thas('ME_ESP') && false) {
    // Test basic file upload
    await http.upload(HTTP + "/upload/upload.esp", { myfile: "test.dat"} )
    ttrue(http.status == 200)
    ttrue(http.response.contains('CLIENT_NAME test.dat'))
    ttrue(http.response.contains('Upload Complete'))

    // Test file upload with additional form fields
    await http.upload(HTTP + "/upload/upload.esp", { myfile: "test.dat"}, {name: "John Smith", address: "100 Mayfair"} )
    ttrue(http.status == 200)
    ttrue(http.response.contains('CLIENT_NAME test.dat'))
    ttrue(http.response.contains('FORM address=100 Mayfair'))
    ttrue(http.response.contains('Upload Complete'))
    http.close()

} else {
    tskip("esp not enabled")
}
