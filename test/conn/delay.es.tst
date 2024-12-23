/*
    Test various protocol delays
 */ 
const HTTP: Uri = tget('TM_HTTP') || "127.0.0.1:4100"
const DELAY  = 500

let s
let count = 0
let response = new ByteArray

//  Connect and delay
s = new Socket
s.connect(HTTP.address)
App.sleep(DELAY)

//  Continue with delay part way through the first line
count += s.write("GET")
ttrue(count == 3)
App.sleep(DELAY)
count += s.write(" /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 10)
for (count = 0; (n = s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

//  Delay before headers
response.reset()
s = new Socket
s.connect(HTTP.address)
count = s.write("GET")
ttrue(count == 3)
App.sleep(DELAY)
count += s.write(" /index.html HTTP/1.0\r\n\r\n")
ttrue(count > 10)
for (count = 0; (n = s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()

//  Delay after one <CR>
response.reset()
s = new Socket
s.connect(HTTP.address)
count = s.write("GET")
ttrue(count == 3)
count += s.write(" /index.html HTTP/1.0\r\n")
App.sleep(DELAY)
count += s.write("\r\n")
ttrue(count > 10)
for (count = 0; (n = s.read(response, -1)) != null; count += n) { }
ttrue(response.toString().contains('200 OK'))
ttrue(response.toString().contains('Hello /index'))
s.close()
