/*
    Request with bad path "sip:nm"
 */
let s = new Socket

s.connect('127.0.0.1:4100')
s.write('OPTIONS sip:nm SIP/2.0\r
Content-Length: 0\r
Accept: application/*\r\n\r\n')

let response = new ByteArray
while (s.read(response, -1) != null) {}
s.close()

