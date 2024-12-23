/*
    put.tst - Put method tests
 */

const HTTP = (tget('TM_HTTP') || "127.0.0.1:4100") + '/proxy'
let http: Http = new Http

//  Test http.put with content data
data = Path("test.dat").readString()

http.put(HTTP + "/tmp/test.dat?r1", data)
if (http.status != 201 && http.status != 204) {
    print("STATUS", http.status)
    print(http.response)
}
ttrue(http.status == 201 || http.status == 204)
http.close()

path = Path("test.dat")
http.setHeader("Content-Length", path.size)
http.put(HTTP + "/tmp/test.dat?r3")
file = File(path).open()
buf = new ByteArray
while (file.read(buf)) {
    http.write(buf)
    buf.flush()
}
file.close()
http.finalize()
http.wait()
ttrue(http.status == 204)
http.close()
