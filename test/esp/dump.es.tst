/*
    dump.tst - ESP dump variables test
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//  Basic get. Validate response code and contents
http.get(HTTP + "/dump.esp?a=b&c=d")
ttrue(http.status == 200)
let r = http.response
ttrue(r.contains("HEADER User-Agent=Embedthis-http"))
ttrue(r.contains("HEADER Date="))
ttrue(r.contains("HEADER Host="))

ttrue(r.contains("SERVER REMOTE_ADDR="))
ttrue(r.contains("SERVER DOCUMENTS="))
ttrue(r.contains("SERVER REQUEST_TRANSPORT=http"))
ttrue(r.contains("SERVER AUTH_USER=null"))
ttrue(r.contains("SERVER AUTH_TYPE=null"))
ttrue(r.contains("SERVER CONTENT_TYPE=null"))
ttrue(r.contains("SERVER SERVER_SOFTWARE=Embedthis-http"))
ttrue(r.contains("SERVER SERVER_PROTOCOL=HTTP/1.1"))
ttrue(r.contains("SERVER SERVER_PORT="))
ttrue(r.contains("SERVER SCRIPT_NAME=/dump.esp"))
ttrue(r.contains("SERVER PATH_INFO="))
ttrue(r.contains("SERVER REMOTE_PORT="))
ttrue(r.contains("SERVER REMOTE_USER=null"))
ttrue(r.contains("SERVER ROUTE_HOME="))
ttrue(r.contains("SERVER SERVER_ADDR="))
ttrue(r.contains("SERVER REQUEST_METHOD=GET"))
ttrue(r.contains("SERVER GATEWAY_INTERFACE=CGI/1.1"))
ttrue(r.contains("SERVER QUERY_STRING=a=b&c=d"))
ttrue(r.contains("SERVER CONTENT_LENGTH=null"))
ttrue(r.contains("SERVER SERVER_NAME="))

ttrue(r.contains("FORM a=b"))
ttrue(r.contains("FORM c=d"))

http.close()
