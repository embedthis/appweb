/*
    cgi.es - CGI support routines
 */

public function contains(http: Http, pat): Void {
    assert(http.response.contains(pat))
}

public function keyword(http: Http, pat: String): String {
    pat.replace(/\//, "\\/").replace(/\[/, "\\[")
    let reg = RegExp(".*" + pat + "=([^<]*).*", "s")
    return http.response.replace(reg, "$1")
}

public function match(http: Http, key: String, value: String): Void {
    if (keyword(http, key) != value) {
        print(http.response)
        print("\nKey \"" + key + "\"")
        print("Expected: " + value)
        // print("Actual  : " + keyword(http, value))
    }
    assert(keyword(http, key) == value)
}
