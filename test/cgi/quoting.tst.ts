/*
    quoting.tst.ts - Test CGI URI encoding and special character quoting
    Verifies proper handling of URL-encoded and shell-escaped characters
 */

import {ttrue, tget} from 'testme'
import {Http, print} from 'ejscript'

const HTTP = tget('TM_HTTP') || '127.0.0.1:4100'
let http: Http = new Http

import {contains, keyword, match} from './cgi'

//  Test simple query with plus separators
http.get(HTTP + '/cgi-bin/testScript?a+b+c')
await http.finalize()
match(http, 'QUERY_STRING', 'a+b+c')
match(http, 'QVAR a b c', '')

//  Test standard key=value pairs
http.get(HTTP + '/cgi-bin/testScript?a=1&b=2&c=3')
await http.finalize()
match(http, 'QUERY_STRING', 'a=1&b=2&c=3')
match(http, 'QVAR a', '1')
match(http, 'QVAR b', '2')
match(http, 'QVAR c', '3')

//  Test encoded spaces without ampersand separator
http.get(HTTP + '/cgi-bin/testScript?a%20a=1%201+b%20b=2%202')
await http.finalize()
match(http, 'QUERY_STRING', 'a%20a=1%201+b%20b=2%202')
match(http, 'QVAR a a', '1 1 b b=2 2')

//  Test encoded spaces with ampersand separator
http.get(HTTP + '/cgi-bin/testScript?a%20a=1%201&b%20b=2%202')
await http.finalize()
match(http, 'QUERY_STRING', 'a%20a=1%201&b%20b=2%202')
match(http, 'QVAR a a', '1 1')
match(http, 'QVAR b b', '2 2')

//  Test special characters requiring shell escaping
http.get(HTTP + '/cgi-bin/testScript?a,b+c%23d+e%3Ff+g%23h+i%27j+kl+m%20n')
await http.finalize()
match(http, 'ARG.2.', 'a,b')
match(http, 'ARG.3.', 'c#d')
match(http, 'ARG.4.', 'e\\?f')
match(http, 'ARG.5.', 'g#h')
match(http, 'ARG.6.', "i\\'j")
match(http, 'ARG.7.', 'kl')
match(http, 'ARG.8.', 'm n')
match(http, 'QUERY_STRING', 'a,b+c%23d+e%3Ff+g%23h+i%27j+kl+m%20n')
ttrue(http.response.contains('QVAR a,b c#d e?f g#h i\'j kl m n'))
http.close()
