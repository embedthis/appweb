/*
    fast.ts - FAST support routines
 */

import {ttrue} from 'testme'
import {Http} from 'ejscript'

export function contains(http: Http, pat: string): void {
    ttrue(http.response.contains(pat))
}

export function keyword(http: Http, pat: string): string {
    pat = pat.replace(/\//, "\\/").replace(/\[/, "\\[")
    let reg = new RegExp(".*" + pat + "=([^<]*).*", "sm")
    let result
    try {
        result = http.response.replace(reg, "$1")
    } catch (err) {
        console.log('Catch', err)
        result = ''
    }
    return result
}

export function match(http: Http, key: string, value: string): void {
    if (keyword(http, key) != value) {
        if (http.response == '') {
            console.log('No http response. Status', http.status)
        } else {
            console.log('Response', http.response)
            console.log("\nKey \"" + key + "\"")
            console.log("Expected: " + value)
            console.log("Actual  : " + keyword(http, value))
        }
    }
    ttrue(keyword(http, key) == value)
}
