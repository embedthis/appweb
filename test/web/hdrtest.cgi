#!/bin/sh
#
#   hdrtest.cgi -- Emit a chosen CGI response header block, including malformed ones.
#
#   The query string selects the case. Used by test/cgi/header-injection.tst.ts to verify that a CGI cannot
#   place a control character in a response header, nor set a status outside the range HTTP defines.
#
#   "status=NNN" emits that literal text as the Status value. A "+" in the value is a space, as in a query.
#
#   The "cl-" cases emit a Content-Length that disagrees with the body, or is not a number at all. Used by
#   test/security/gateway-length.tst.c: the handler frames the response from this header and disables
#   chunking, so it must verify the claim rather than take the program's word for it.
#

case "${QUERY_STRING}" in
cl-long)
    #   Declares 9999 bytes and writes 5. A client would read the next response on the connection as
    #   the remainder of this one.
    printf 'Content-Type: text/plain\r\nContent-Length: 9999\r\n\r\nSHORT'
    ;;

cl-short)
    #   Declares 2 bytes and writes 49. The excess is a complete response, which is where it would be
    #   parsed from if it reached the client: at the head of the buffer, as the next response.
    printf 'Content-Type: text/plain\r\nContent-Length: 2\r\n\r\nAA'
    printf 'HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\nINJECTED\n'
    ;;

cl-bad)
    #   Not 1*DIGIT. A lenient conversion stopped at the first non-digit and read this as 5.
    printf 'Content-Type: text/plain\r\nContent-Length: 5abc\r\n\r\nSHORT'
    ;;

cl-huge)
    #   Overflows an int64. A lenient conversion wrapped this to an arbitrary length.
    printf 'Content-Type: text/plain\r\nContent-Length: 99999999999999999999999\r\n\r\nSHORT'
    ;;

cl-exact)
    #   The ordinary case: the declared length is the body length.
    printf 'Content-Type: text/plain\r\nContent-Length: 5\r\n\r\nSHORT'
    ;;

cl-empty)
    #   A declared empty body, and no body. Also ordinary.
    printf 'Content-Type: text/plain\r\nContent-Length: 0\r\n\r\n'
    ;;

bare-cr)
    #   A CR inside the value. Not a line terminator to this handler, but is one to many other parsers.
    printf 'Content-Type: text/plain\r\nX-Test: aaa\rbbb\r\n\r\nSHORT'
    ;;

trailing-cr)
    #   A redundant trailing CR. Trimmed, as it always has been, and the request succeeds.
    printf 'Content-Type: text/plain\r\nX-Test: aaa\r\r\n\r\nSHORT'
    ;;

crlf)
    #   A CRLF ends the header. The handler cannot tell this from a CGI emitting two headers deliberately.
    printf 'Content-Type: text/plain\r\nX-Test: a\r\nX-Injected: 1\r\n\r\nSHORT'
    ;;

status=*)
    printf 'Content-Type: text/plain\r\nStatus: %s\r\n\r\nSHORT' \
        "$(printf '%s' "${QUERY_STRING#status=}" | tr '+' ' ')"
    ;;

*)
    printf 'Content-Type: text/plain\r\n\r\nSHORT'
    ;;
esac
