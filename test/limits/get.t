/*
    get.tst - Extreme GET tests
 */

//  TODO - should be able to have a module test.http.get
module test.http.getmethod {

    const HTTP = App.config.main || "127.0.0.1:4100"
    const URL = HTTP + "/index.html"
    const BIG = HTTP + "/big.ejs"

    let http: Http = new Http

print("DEPTH " + test.depth)
    for (iter in test.depth) {
        url = URL + "?"
        for (i in 2000 * (iter + 1)) {
            url += + "key" + i + "=" + Date().now() + "&"
        }
        url = url.trim("&")
        http = new Http
    print(url.length)
        http.get(url)
        print(http.status)
        print(http.response)
        assert(http.status == 200)
        assert(http.response.contains("Hello"))
break
    }
}
