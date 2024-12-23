/*
    pausing.tst - Test pausing reading from server. Should cause flow control
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
load("fast.es")

// Depths:    0  1  2  3   4   5   6    7    8    9  
let sizes = [ 1, 2, 4, 8, 16, 32, 64, 128, 256, 512 ]
let len = sizes[tdepth()] * 102400
let bytes = len * 10

let http = new Http
http.setHeader("SWITCHES", "-b%20" + len)
http.get(HTTP + "/fast-bin/fastProgram")
ttrue(http.status == 200)

//  Read data, but pause between reads to force flow control back to the FAST program
let data = new ByteArray(1024 * 16, false)
let count, n
let fp = new File("pausing.tmp", "w")
while (true) {
    if (http.read(data) == null) {
        break
    }
    fp.write(data)
    count += data.length
    App.sleep(5)
    if (http.read(data) == null) {
        break
    }
    fp.write(data)
    count += data.length
}
fp.close()

ttrue(count >= bytes)
http.close()
Path("pausing.tmp").remove()
