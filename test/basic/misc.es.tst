/*
    misc.tst - Misc. Http tests
 */

ttrue(Uri("a.txt").mimeType == "text/plain")
ttrue(Uri("a.html").mimeType == "text/html")
ttrue(Uri("a.json").mimeType == "application/json")
