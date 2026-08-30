/*
    headers-single.tst.ts - Single-valued header field ratchet

    The request header hash is caseless and replacing, so a repeated field is collapsed last-wins before any
    consumer sees it. For a field that RFC 9110 defines as single-valued that is a disagreement waiting to
    happen: a front-end that reads the first copy frames or authorizes the request differently from Appweb,
    which would read the last (CWE-444). The repeat must be rejected where both copies are still visible.

    - A duplicate single-valued field is rejected with 400 and one response line
    - The rejection is caseless, since field names are case insensitive
    - Cookie and Set-Cookie keep their duplicates -- they are the legitimate exception
    - A field that may legitimately repeat is unaffected
 */

import {CGI, HOST, accept, reject} from './raw'

function dup(header: string, first: string, second: string): string {
    return `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\n${header}: ${first}\r\n${header}: ${second}\r\n\r\n`
}

/*
    Two Content-Length headers leave the message framing undetermined. RFC 9112 6.3 requires this be rejected;
    Appweb silently took the last value, so a front-end framing on the first desynchronised the connection.
 */
await reject('Duplicate Content-Length',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 5\r\nContent-Length: 6\r\n\r\nHELLOZ`,
    '400 Bad Request')

//  Identical values are no better -- the message is still ambiguous on the wire
await reject('Duplicate equal Content-Length',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\nHELLO`,
    '400 Bad Request')

//  Two Host headers make the target origin ambiguous, which is a routing and virtual host bypass primitive
await reject('Duplicate Host',
    `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nHost: evil.example.com\r\n\r\n`,
    '400 Bad Request')

//  Two Authorization headers let a front-end authorize on credentials the server never evaluates
await reject('Duplicate Authorization',
    dup('Authorization', 'Basic am9lOnBhc3N3b3Jk', 'Basic bWFyeTpwYXNzd29yZA=='),
    '400 Bad Request')

await reject('Duplicate Proxy-Authorization',
    dup('Proxy-Authorization', 'Basic am9lOnBhc3N3b3Jk', 'Basic bWFyeTpwYXNzd29yZA=='),
    '400 Bad Request')

//  Two Content-Type headers let the body be parsed one way in front and another behind
await reject('Duplicate Content-Type',
    dup('Content-Type', 'text/plain', 'application/x-www-form-urlencoded'),
    '400 Bad Request')

await reject('Duplicate Referer', dup('Referer', 'http://a.example.com/', 'http://b.example.com/'),
    '400 Bad Request')

await reject('Duplicate User-Agent', dup('User-Agent', 'agent-one', 'agent-two'), '400 Bad Request')

await reject('Duplicate If-Modified-Since',
    dup('If-Modified-Since', 'Mon, 01 Jan 2035 00:00:00 GMT', 'Tue, 02 Jan 2035 00:00:00 GMT'),
    '400 Bad Request')

//  Field names are case insensitive, so the check must be too
await reject('Duplicate mixed case Host',
    `GET /index.html HTTP/1.1\r\nHost: ${HOST}\r\nHOST: evil.example.com\r\n\r\n`,
    '400 Bad Request')

await reject('Duplicate mixed case Content-Length',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 5\r\ncOnTeNt-LeNgTh: 6\r\n\r\nHELLOZ`,
    '400 Bad Request')

/*
    Cookie is the exception. A repeated Cookie field is legitimate, so it keeps its duplicates in the header
    hash and the request must still be served rather than rejected.
    Note: only the first of the two reaches the CGI environment. That is a separate pre-existing defect in how
    duplicate keys are copied to the child, so this asserts acceptance only and does not pin the CGI value.
 */
await accept('Duplicate Cookie is accepted',
    `GET ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nCookie: first=one\r\nCookie: second=two\r\n\r\n`,
    '200 OK')

//  A field that may legitimately repeat is untouched
await accept('Repeated Accept-Encoding',
    `GET ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nAccept-Encoding: gzip\r\nAccept-Encoding: deflate\r\n\r\n`,
    '200 OK')

//  A single occurrence of each guarded field is of course still served
await accept('Single Content-Type',
    `GET ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: text/plain\r\nUser-Agent: agent-one\r\n\r\n`,
    '200 OK')
