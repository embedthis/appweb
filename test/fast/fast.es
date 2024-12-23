/*
    fast.es - FAST support routines
 */

public function contains(http: Http, pat): Void {
    assert(http.response.contains(pat))
}

public function keyword(http: Http, pat: String): String {
    pat.replace(/\//, "\\/").replace(/\[/, "\\[")
    let reg = RegExp(".*" + pat + "=([^<]*).*", "sm")
    let result 
    try {
        result = http.response.replace(reg, "$1")
    } catch (err) {
        print('Catch', err)
        result = ''
    }
    return result
}

public function match(http: Http, key: String, value: String): Void {
    if (keyword(http, key) != value) {
        if (http.response == '') {
            print('No http response. Status', http.status)
        } else {
            print('Response', http.response)
            print("\nKey \"" + key + "\"")
            print("Expected: " + value)
            print("Actual  : " + keyword(http, value))
        }
    }
    assert(keyword(http, key) == value)
}
