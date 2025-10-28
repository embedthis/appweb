/*
    cgi.ts - CGI support routines
 */

import {ttrue} from 'testme'
import {Http} from 'ejscript'

export function contains(http: Http, pat: string): void {
    ttrue(http.response.contains(pat))
}

export function keyword(http: Http, pat: string): string {
    pat = pat.replace(/\//, "\\/").replace(/\[/, "\\[")
    let reg = new RegExp(".*" + pat + "=([^<]*).*", "s")
    return http.response.replace(reg, "$1")
}

export function match(http: Http, key: string, value: string): void {
    if (keyword(http, key) != value) {
        console.log('RESPONSE', http.response)
        console.log("\nKey \"" + key + "\"")
        console.log("Expected: " + value)
        console.log("Actual  : " + keyword(http, key))
    }
    ttrue(keyword(http, key) == value)
}
