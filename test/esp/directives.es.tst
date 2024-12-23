/*
    directives.tst - Test various ESP directives
 */

const HTTP = tget('TM_HTTP') || "127.0.0.1:4100"
let http: Http = new Http

//	Output should look like:
//
//	<html>
//	<head>
//	    <title>ESP Directives</title>
//	</head>
//	<body>
//	    <h1>ESP Directives</h1>
//	    Today's Message: Hello World
//	    Luck Number: 42
//	    Hostname: local.magnetar.local
//	    Time: Wed Jul 27 2011 09:53:29 GMT-0700 (PDT)
//	    Formatted number: 12,345,678
//	    Safe Strings: &lt;html&gt;
//	</body>
//	</html>

http.get(HTTP + "/directives.esp?weather=sunny")
ttrue(http.status == 200)
let r = http.response
ttrue(r.contains("ESP Directives"))
ttrue(r.contains("ESP Directives"))
ttrue(r.contains("Today's Message: Hello World"))
ttrue(r.contains("Lucky Number: 42"))
ttrue(r.contains("Formatted Number: 12,345,678"))
ttrue(r.contains("Safe Strings: &lt;bold&gt;"))
ttrue(r.contains("Weather: sunny"))
http.close()
