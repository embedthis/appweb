/*
    put.tst - Put method tests
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Test http.put with content data
data = Path("test.dat").readString()
http.put(HTTP + "/tmp/test.dat", data)
ttrue(http.status == 201 || http.status == 204)
http.reset()

//  This request should hang because we don't write any data and finalize. Wait with a timeout.
http.setHeader("Content-Length", 1000)
http.put(HTTP + "/tmp/test.dat")
ttrue(http.wait(250) == false)
http.close()

path = Path("test.dat")
http.setHeader("Content-Length", path.size)
http.put(HTTP + "/tmp/test.dat")
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
