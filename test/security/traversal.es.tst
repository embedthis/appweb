/*
    Test directory traversal
 */

const HTTP: Uri = tget('TM_HTTP') || "127.0.0.1:4100"

http = new Http
http.get(HTTP + "/../../appweb.conf")
ttrue(http.status == 400)
http.close()

http.get(HTTP + "/../../index.html")
ttrue(http.status == 400)
http.close()

/* Test windows '\' delimiter */
http.get(HTTP + "/..%5Cappweb.conf")
ttrue(http.status == 400)
http.close()

http.get(HTTP + "/../../../../../.x/.x/.x/.x/.x/.x/etc/passwd")
ttrue(http.status == 400)
http.close()

