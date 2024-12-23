/*
    manual.tst - Test manual caching mode
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Prep and clear the cache
http.get(HTTP + "/cache/clear")
ttrue(http.status == 200)

//  1. Test that content is being cached
//  Initial get
http.get(HTTP + "/cache/manual")
ttrue(http.status == 200)
let resp = deserialize(http.response)
let first = resp.number
ttrue(resp.uri == "/cache/manual")
ttrue(resp.query == "null")

//  Second get, should get the same content (number must not change)
//  This is being done manually by the "manual" method in the cache controller
http.get(HTTP + "/cache/manual")
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.number == first)
ttrue(resp.uri == "/cache/manual")
ttrue(resp.query == "null")


//  Update the cache
http.get(HTTP + "/cache/update?updated=true")
ttrue(http.status == 200)
ttrue(http.response == "done")

//  Get again, should get updated cached data
http.get(HTTP + "/cache/manual")
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.query == "updated=true") 


//  Test X-SendCache
http.get(HTTP + "/cache/manual?send")
ttrue(http.status == 200)
resp = deserialize(http.response)
ttrue(resp.query == "updated=true") 

http.close()
