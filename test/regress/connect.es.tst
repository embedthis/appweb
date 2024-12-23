/*
    Test CONNECT IP 
 */
const HTTP: Uri = tget('TM_HTTP') || "127.0.0.1:4100"
const DELAY  = 500

let s = new Socket
let response = new ByteArray
s.connect(HTTP.address)
let request =  "CONNECT 10.129.252.79:9993 HTTP/1.1\r\n\r\n"
s.write(request)
while ((n = s.read(response, -1)) != null) {
    if (response.toString().contains("</html")) break
}
ttrue(response.toString().contains('HTTP/1.1 400 Bad Request'))
s.close()
