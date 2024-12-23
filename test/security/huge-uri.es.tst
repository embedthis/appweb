/*
    Very large URI test (3MB)
 */ 
const HTTP: Uri = tget('TM_HTTP') || "127.0.0.1:4100"

//  This writes a ~100K URI. LimitUri should be less than 100K for this unit test.

let data = "/"
for (i in 1000) {
    data += "012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678\n"
}

/*
    Test LimitUri
 */
let s = new Socket
s.connect(HTTP.address)
let count = 0
try {
    count += s.write("GET ")
    count += s.write(data)
    count += s.write(" HTTP/1.1\r\n\r\n")
} catch {
    tfail("Write failed. Wrote  " + count + " of " + data.length + " bytes.")
    //  Check appweb.conf LimitRequestHeader. This must be sufficient to accept the write the header.
}

response = new ByteArray
s.read(response, -1)
ttrue(response.toString().contains('413 -- Request Entity Too Large'))
s.close()

//  Check server still up
App.sleep(2000)
http = new Http
http.get(HTTP + "/index.html")
ttrue(http.status == 200)
http.close()
