/*
    content-length.tst.ts - Content-Length grammar ratchet

    Verifies that Content-Length is parsed against the RFC 9112 6.3.5 grammar, Content-Length = 1*DIGIT, rather
    than by a lenient best-effort conversion. A value that Appweb frames differently from a strict front-end is
    a request smuggling primitive (CWE-444), so the declared text and the framed length must always agree.

    - Anything that is not 1*DIGIT is rejected with 400
    - A value too large for an int64 is rejected with 413, never wrapped
    - Leading zeros and the OWS that RFC 9110 5.5 excludes from the field value are accepted
    - A well formed length still frames the body and reaches CGI as CONTENT_LENGTH
 */

import {CGI, HOST, accept, reject} from './raw'

//  A body long enough that a wrapped or truncated length would still find bytes to frame
const BODY = 'HELLOWORLD'

function post(length: string, uri: string = '/index.html'): string {
    return `POST ${uri} HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: ${length}\r\n\r\n${BODY}`
}

//  Trailing garbage after the digits. stoi() stopped at the first non-digit and framed 5 bytes
await reject('CL trailing garbage', post('5abc'), '400 Bad Request')
await reject('CL trailing chunk-ext', post('5;x'), '400 Bad Request')
await reject('CL trailing dot', post('5.0'), '400 Bad Request')
await reject('CL embedded space', post('5 x'), '400 Bad Request')

//  A sign is not part of 1*DIGIT
await reject('CL plus sign', post('+5'), '400 Bad Request')
await reject('CL minus sign', post('-5'), '400 Bad Request')

//  A hex prefix is not part of 1*DIGIT. stoiradix() would read the leading 0
await reject('CL hex prefix', post('0x10'), '400 Bad Request')

//  Non-numeric and empty values
await reject('CL alphabetic', post('abc'), '400 Bad Request')
await reject('CL empty', post(''), '400 Bad Request')
await reject('CL lone space', post(' '), '400 Bad Request')

/*
    Overflow must be detected, not wrapped. 2^64 + 100 wrapped to 100 through the int64 accumulator, passed the
    "< 0" guard and framed 100 bytes -- a length the client never declared.
 */
await reject('CL 2^64 + 100', post('18446744073709551716'), '413 Request Entity Too Large')
await reject('CL twenty nines', post('99999999999999999999'), '413 Request Entity Too Large')

/*
    RFC 9110 5.5 excludes leading and trailing OWS from the field value, so these are well formed requests
    carrying a Content-Length of 5 and must be accepted. Leading zeros are 1*DIGIT and are equally legal.
 */
await accept('CL trailing space', post('5 ', CGI), 'Post Data 5 bytes found')
await accept('CL leading space', post(' 5', CGI), 'Post Data 5 bytes found')
await accept('CL leading zeros', post('0000000005', CGI), 'Post Data 5 bytes found')

/*
    A well formed length still frames the body, and the text Appweb parsed is the text CGI is told about, so
    the server and the CGI child cannot disagree about where the body ends.
 */
await accept('CL frames the body', post('5', CGI), 'Post Data 5 bytes found')
await accept('CL reaches CGI', post('5', CGI), 'CONTENT_LENGTH=5')
