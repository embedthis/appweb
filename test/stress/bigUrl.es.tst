/*
    bigUrl.tst - Stress test long URLs 
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"

let http: Http = new Http

// Server configured to accept up to 5K URIs
let query = ""
for (i in 200) {
    query += + "key" + i + "=" + 1234567890 + "&"
}
query = query.trim("&")

// Test /index.html
let uri = HTTP + "/index.html?" + query
http.get(uri)
ttrue(http.status == 200)
ttrue(http.response.contains("Hello /index.html"))
http.close()

query = query + '&' + query

// This should fail
let uri = HTTP + "/index.html?" + query
let caught
try {
    /* Server should disconnect without a response */
    http.get(uri)
    print(http.status)
    ttrue(0)
} catch (e) {
    caught = true
}
ttrue(caught)
http.close()
