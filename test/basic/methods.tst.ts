/*
    methods.tst - Test misc Http methods

    Tests various HTTP methods including GET, PUT, DELETE, POST, and OPTIONS.
    Validates case-insensitive method names and proper handling of each method.
 */

import {ttrue, tget} from 'testme'
import {Http, Path} from 'ejscript'

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

// Test that HTTP methods are case-insensitive
http.connect("GeT", HTTP + "/index.html")
await http.finalize()
ttrue(http.status == 200)

// Test PUT method to upload a file
let data = await new Path("test.dat").readString()
http.put(HTTP + "/tmp/test.dat", data)
await http.finalize()
ttrue(http.status == 201 || http.status == 204)

// Test DELETE method to remove the file
http.connect("DELETE", HTTP + "/tmp/test.dat")
await http.finalize()
ttrue(http.status == 204)

// Test POST method with data
http.post(HTTP + "/index.html", "Some data")
await http.finalize()
ttrue(http.status == 200)

// Test OPTIONS method for TRACE-enabled path
http.connect("OPTIONS", HTTP + "/trace/index.html")
await http.finalize()
ttrue(http.header("Allow")?.split(',').sort().join(',') == "GET,OPTIONS,POST,TRACE")

// Test OPTIONS method for writable path
http.connect("OPTIONS", HTTP + "/tmp/index.html")
await http.finalize()
ttrue(http.header("Allow")?.split(',').sort().join(',') == "DELETE,GET,OPTIONS,POST,PUT")
