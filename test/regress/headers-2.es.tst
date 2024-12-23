/*
    Test with bad headers and pipelining

    This tries to crash the server
 */

if (tdepth() >= 6) {
    let IP = tget('TM_HTTP') || "127.0.0.1:4100"
    let ip = IP.replace('http://', '')

    let response = new ByteArray
    let iterations = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]

    let count = iterations[tdepth()] * 1000
    let s = new Socket

    for (let i = 0; i < count; i++) {
        /*
            Send a valid request 
         */
        try {
            s.connect(ip)
            s.write('GET / HTTP/1.1\r
    Accept: application/xhtml+xml;v=2.0\r
    Connection: keep-alive\r\n\r\n')
            s.read(response, -1)
        } catch (e) {
            print("CATCH1", e)
            s.close()
            s = new Socket
        }

        /*
            Send an invalid request
         */
        try {
            s.write('GET http://[::A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:\r
A:A:A:A:A]:8080/ HTTP/1.1\r
Host: 7.7.7.8:8080\r
User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537. 36\r
Accept: text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5\r
Accept-Language: en-us,en;q=0.5\r
Accept-Encoding: gzip,deflate\r
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7\r
Keep-Alive: 300\r
Connection: keep-alive\r\n\r\n')
            s.read(response, -1)
        } catch (e) {
            /* ignore error and continue */
            s.close()
            s = new Socket
        }
    }
} else {
    tskip('Skip test -- Runs at depth 6')
}
