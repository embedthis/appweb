/*
    framing.tst.ts - Transfer-Encoding framing ratchet

    Verifies that the server derives the message framing from Transfer-Encoding exactly as RFC 9112 6.1
    requires, so it can never disagree with a front-end about where a request body ends (CWE-444 request
    smuggling). Each rejected case must produce exactly one response line and close the connection.

    - Transfer-Encoding with Content-Length is rejected in either header order
    - Transfer-Encoding on HTTP/1.0 is rejected
    - A repeated Transfer-Encoding header is rejected
    - Any transfer coding other than a lone "chunked", including a coding list, is unsupported
    - "chunked" is matched case insensitively and ignoring surrounding white space
 */

import {CGI, HOST, accept, reject} from './raw'

const CHUNKS = '5\r\nHELLO\r\n0\r\n\r\n'

//  The de-chunked byte count is the signal that the body was framed correctly
const POSTED = 'Post Data 5 bytes found'

//  Content-Length and Transfer-Encoding together is a CL.TE desync primitive, in either order
await reject('CL then TE',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
    '400 Bad Request')

await reject('TE then CL',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n0\r\n\r\n`,
    '400 Bad Request')

//  Chunked transfer coding does not exist in HTTP/1.0
await reject('TE on HTTP/1.0',
    `POST /index.html HTTP/1.0\r\nHost: ${HOST}\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
    '400 Bad Request')

//  A repeated Transfer-Encoding leaves the framing undetermined
await reject('Duplicate TE',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
    '400 Bad Request')

//  Only the single coding "chunked" is supported. A list is unsupported wherever chunked appears in it
await reject('TE gzip, chunked',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n`,
    '501 Not Implemented')

await reject('TE chunked, gzip',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: chunked, gzip\r\n\r\n0\r\n\r\n`,
    '501 Not Implemented')

await reject('TE identity',
    `POST /index.html HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: identity\r\n\r\n0\r\n\r\n`,
    '501 Not Implemented')

//  Coding names are case insensitive and may be surrounded by white space
await accept('TE Chunked',
    `POST ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: Chunked\r\n\r\n${CHUNKS}`, POSTED)

await accept('TE CHUNKED',
    `POST ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: CHUNKED\r\n\r\n${CHUNKS}`, POSTED)

await accept('TE padded chunked',
    `POST ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: \t chunked \t\r\n\r\n${CHUNKS}`, POSTED)

//  A plain chunked POST is unaffected
await accept('TE chunked',
    `POST ${CGI} HTTP/1.1\r\nHost: ${HOST}\r\nTransfer-Encoding: chunked\r\n\r\n${CHUNKS}`, POSTED)
